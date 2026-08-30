param(
    [string]$ProjectRoot = (Get-Location).Path,
    [ValidateSet("discover","list","get","create","update","comment","transition","link-pr","sync")]
    [string]$Action = "discover",
    [string]$ExternalId,
    [string]$Title,
    [string]$Body,
    [string]$Status,
    [string]$Url,
    [string]$InternalId,
    [string]$Query,
    [switch]$DryRun
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")

$cfg = Get-IntegrationConfig $ProjectRoot
$provider = ([string]$cfg.provider).ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($provider) -or $provider -eq "none") {
    throw "TRACKER_BLOCKED: work_management.provider está 'none'. Configure .ai/integrations.json."
}
if ($Action -eq "sync") {
    if ([string]::IsNullOrWhiteSpace($InternalId)) { throw "InternalId obrigatório para sync." }
    $aiForSync = Get-AiRoot $ProjectRoot
    $safeId = ($InternalId -replace '[^0-9A-Za-z._-]', '_')
    $itemPath = Join-Path (Join-Path $aiForSync "work-items") "$safeId.json"
    if (-not (Test-Path -LiteralPath $itemPath)) { throw "Work item normalizado ausente: $itemPath" }
    $item = Read-JsonFile $itemPath
    $nextAction = if ([string]::IsNullOrWhiteSpace([string]$item.external_id) -and [string]::IsNullOrWhiteSpace([string]$item.external_key)) { "create" } else { "update" }
    $nextId = if (-not [string]::IsNullOrWhiteSpace([string]$item.external_key)) { [string]$item.external_key } else { [string]$item.external_id }
    $args = @("-ProjectRoot",$ProjectRoot,"-Action",$nextAction,"-InternalId",$InternalId,"-Title",[string]$item.title)
    if ($nextAction -eq "update") { $args += @("-ExternalId",$nextId) }
    if ($DryRun) { $args += "-DryRun" }
    & $PSCommandPath @args
    exit $LASTEXITCODE
}
$controlPath = Join-Path (Get-AiRoot $ProjectRoot) "control.json"
$globalStatus = ""
if (Test-Path -LiteralPath $controlPath) {
    $control = Read-JsonFile $controlPath
    $globalStatus = [string]$control.global_status
}
$traceScript = Join-Path $PSScriptRoot "traceability.ps1"

function Ensure-TerminalStatusAllowed([string]$RequestedStatus, [string]$DoneStatus) {
    if ([string]::IsNullOrWhiteSpace($RequestedStatus) -or [string]::IsNullOrWhiteSpace($DoneStatus)) { return }
    $policy = $cfg.sync_policy
    $requiresDone = $true
    if ($null -ne $policy -and $null -ne $policy.external_done_requires_global_done) { $requiresDone = [bool]$policy.external_done_requires_global_done }
    if ($requiresDone -and $RequestedStatus.Equals($DoneStatus, [StringComparison]::OrdinalIgnoreCase) -and $globalStatus -ne "DONE") {
        throw "TRACKER_BLOCKED: status externo terminal '$DoneStatus' exige global_status=DONE; atual=$globalStatus"
    }
}

function Invoke-Gh([string[]]$Arguments) {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($null -eq $gh) { throw "TRACKER_BLOCKED: GitHub CLI 'gh' não encontrado." }
    if ($DryRun) {
        return @("DRY_RUN gh " + ($Arguments -join " "))
    }
    return @(Invoke-ExternalChecked -Command $gh.Source -Arguments $Arguments -PassThru)
}

function ConvertTo-Adf([string]$Text) {
    return [ordered]@{
        type = "doc"; version = 1
        content = @([ordered]@{ type="paragraph"; content=@([ordered]@{ type="text"; text=$Text }) })
    }
}

function Invoke-JiraRequest([string]$Method, [string]$Path, $Payload = $null) {
    $j = $cfg.jira
    $base = ([string]$j.base_url).TrimEnd('/')
    if ([string]::IsNullOrWhiteSpace($base)) { throw "TRACKER_BLOCKED: jira.base_url ausente." }
    $emailEnv = if ([string]::IsNullOrWhiteSpace([string]$j.email_env)) { "JIRA_EMAIL" } else { [string]$j.email_env }
    $tokenEnv = if ([string]::IsNullOrWhiteSpace([string]$j.token_env)) { "JIRA_API_TOKEN" } else { [string]$j.token_env }
    $email = [Environment]::GetEnvironmentVariable($emailEnv)
    $token = [Environment]::GetEnvironmentVariable($tokenEnv)
    if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($token)) {
        throw "TRACKER_BLOCKED: Jira auth ausente. Configure env vars $emailEnv e $tokenEnv."
    }
    if ($DryRun) { return [pscustomobject]@{ dry_run=$true; method=$Method; path=$Path } }
    $basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${email}:${token}"))
    $headers = @{ Authorization = "Basic $basic"; Accept = "application/json" }
    $uri = "$base$Path"
    if ($null -eq $Payload) {
        return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
    }
    $headers["Content-Type"] = "application/json"
    $json = $Payload | ConvertTo-Json -Depth 30
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $json
}

function Invoke-Linear([string]$GraphQl, [hashtable]$Variables = @{}) {
    $l = $cfg.linear
    $tokenEnv = if ([string]::IsNullOrWhiteSpace([string]$l.token_env)) { "LINEAR_API_KEY" } else { [string]$l.token_env }
    $token = [Environment]::GetEnvironmentVariable($tokenEnv)
    if ([string]::IsNullOrWhiteSpace($token)) { throw "TRACKER_BLOCKED: Linear auth ausente. Configure env var $tokenEnv." }
    if ($DryRun) { return [pscustomobject]@{ dry_run=$true; query=$GraphQl; variables=$Variables } }
    $scheme = if ([string]::IsNullOrWhiteSpace([string]$l.auth_scheme)) { "api-key" } else { ([string]$l.auth_scheme).ToLowerInvariant() }
    $auth = if ($scheme -eq "bearer") { "Bearer $token" } else { $token }
    $headers = @{ Authorization=$auth; "Content-Type"="application/json" }
    $payload = @{ query=$GraphQl; variables=$Variables } | ConvertTo-Json -Depth 30
    $response = Invoke-RestMethod -Method Post -Uri "https://api.linear.app/graphql" -Headers $headers -Body $payload
    if ($null -ne $response.errors -and @($response.errors).Count -gt 0) {
        $msgs = @($response.errors | ForEach-Object { $_.message }) -join "; "
        throw "Linear GraphQL errors: $msgs"
    }
    return $response.data
}

$result = $null
$resolvedExternalId = $ExternalId
$resolvedExternalKey = ""
$resolvedUrl = $Url
$resolvedTitle = $Title
$resolvedExternalStatus = $Status

switch ($provider) {
    "github" {
        $g = $cfg.github
        $owner = [string]$g.owner
        $repoName = [string]$g.repository
        if ([string]::IsNullOrWhiteSpace($owner) -or [string]::IsNullOrWhiteSpace($repoName)) { throw "TRACKER_BLOCKED: github.owner/repository obrigatórios." }
        $repo = "$owner/$repoName"
        if ($Action -eq "discover") {
            $ver = Invoke-Gh @("--version")
            $auth = Invoke-Gh @("auth","status")
            $projectCheck = $null
            if ([int]$g.project_number -gt 0) {
                $po = if ([string]::IsNullOrWhiteSpace([string]$g.project_owner)) { $owner } else { [string]$g.project_owner }
                $projectCheck = Invoke-Gh @("project","view",[string]$g.project_number,"--owner",$po,"--format","json")
            }
            $result = [ordered]@{ provider="github"; available=$true; version=$ver; auth=$auth; project=$projectCheck }
        } elseif ($Action -eq "list") {
            if ([int]$g.project_number -gt 0) {
                $po = if ([string]::IsNullOrWhiteSpace([string]$g.project_owner)) { $owner } else { [string]$g.project_owner }
                $args = @("project","item-list",[string]$g.project_number,"--owner",$po,"--format","json","--limit","50")
                if (-not [string]::IsNullOrWhiteSpace($Query)) { $args += @("--query",$Query) }
                $result = Invoke-Gh $args
            } else {
                $args = @("issue","list","--repo",$repo,"--json","number,title,state,url,assignees,labels","--limit","50")
                if (-not [string]::IsNullOrWhiteSpace($Query)) { $args += @("--search",$Query) }
                $result = Invoke-Gh $args
            }
        } elseif ($Action -eq "get") {
            if ([string]::IsNullOrWhiteSpace($ExternalId)) { throw "ExternalId obrigatório" }
            $result = Invoke-Gh @("issue","view",$ExternalId,"--repo",$repo,"--json","number,title,state,url,assignees,labels,body")
        } elseif ($Action -eq "create") {
            if ([string]::IsNullOrWhiteSpace($Title)) { throw "Title obrigatório" }
            $args = @("issue","create","--repo",$repo,"--title",$Title,"--body",$Body)
            $created = Invoke-Gh $args
            $issueUrl = (($created | Out-String).Trim() -split "`r?`n")[-1]
            if ([int]$g.project_number -gt 0 -and -not $DryRun) {
                $po = if ([string]::IsNullOrWhiteSpace([string]$g.project_owner)) { $owner } else { [string]$g.project_owner }
                Invoke-Gh @("project","item-add",[string]$g.project_number,"--owner",$po,"--url",$issueUrl,"--format","json") | Out-Null
            }
            if (-not $DryRun -and -not [string]::IsNullOrWhiteSpace($issueUrl)) {
                try { $resolvedExternalId = ([uri]$issueUrl).Segments[-1].TrimEnd('/') } catch { $resolvedExternalId = "" }
                $resolvedUrl = $issueUrl
            }
            $result = [ordered]@{ provider="github"; external_id=$resolvedExternalId; url=$issueUrl; raw=$created }
            if (-not [string]::IsNullOrWhiteSpace($issueUrl) -and -not $DryRun) {
                & $traceScript -ProjectRoot $ProjectRoot -Action link-external -Provider github -ExternalId $resolvedExternalId -Url $issueUrl | Out-Null
            }
        } elseif ($Action -eq "update") {
            if ([string]::IsNullOrWhiteSpace($ExternalId)) { throw "ExternalId obrigatório" }
            $args = @("issue","edit",$ExternalId,"--repo",$repo)
            if (-not [string]::IsNullOrWhiteSpace($Title)) { $args += @("--title",$Title) }
            if (-not [string]::IsNullOrWhiteSpace($Body)) { $args += @("--body",$Body) }
            $result = Invoke-Gh $args
        } elseif ($Action -eq "comment") {
            if ([string]::IsNullOrWhiteSpace($ExternalId) -or [string]::IsNullOrWhiteSpace($Body)) { throw "ExternalId e Body obrigatórios" }
            $result = Invoke-Gh @("issue","comment",$ExternalId,"--repo",$repo,"--body",$Body)
        } elseif ($Action -eq "transition") {
            if ([string]::IsNullOrWhiteSpace($ExternalId) -or [string]::IsNullOrWhiteSpace($Status)) { throw "ExternalId e Status obrigatórios" }
            Ensure-TerminalStatusAllowed $Status ([string]$g.done_status)
            if ($Status -match '^(closed|close)$') {
                Ensure-TerminalStatusAllowed ([string]$g.done_status) ([string]$g.done_status)
                $result = Invoke-Gh @("issue","close",$ExternalId,"--repo",$repo)
            } elseif ($Status -match '^(open|reopen)$') {
                $result = Invoke-Gh @("issue","reopen",$ExternalId,"--repo",$repo)
            } elseif ([int]$g.project_number -gt 0) {
                $view = Invoke-Gh @("issue","view",$ExternalId,"--repo",$repo,"--json","url")
                $viewText = ($view | Out-String).Trim()
                $issueUrl = if ($DryRun) { "DRY_RUN_URL" } else { ($viewText | ConvertFrom-Json).url }
                $po = if ([string]::IsNullOrWhiteSpace([string]$g.project_owner)) { $owner } else { [string]$g.project_owner }
                $field = if ([string]::IsNullOrWhiteSpace([string]$g.status_field)) { "Status" } else { [string]$g.status_field }
                $result = Invoke-Gh @("project","item-edit",[string]$g.project_number,"--owner",$po,"--url",$issueUrl,"--field",$field,"--value",$Status,"--format","json")
            } else {
                throw "TRACKER_BLOCKED: status '$Status' exige github.project_number configurado ou use open/closed."
            }
        } elseif ($Action -eq "link-pr") {
            if ([string]::IsNullOrWhiteSpace($ExternalId) -or [string]::IsNullOrWhiteSpace($Url)) { throw "ExternalId e Url obrigatórios" }
            $result = Invoke-Gh @("issue","comment",$ExternalId,"--repo",$repo,"--body","Linked pull request: $Url")
            if ([int]$g.project_number -gt 0 -and -not $DryRun) {
                $po = if ([string]::IsNullOrWhiteSpace([string]$g.project_owner)) { $owner } else { [string]$g.project_owner }
                Invoke-Gh @("project","item-add",[string]$g.project_number,"--owner",$po,"--url",$Url,"--format","json") | Out-Null
            }
            if (-not $DryRun) {
                & $traceScript -ProjectRoot $ProjectRoot -Action link-pr -Provider github -ExternalId $ExternalId -Url $Url | Out-Null
                if (-not [string]::IsNullOrWhiteSpace($InternalId)) { Update-NormalizedWorkItemLink -ProjectRoot $ProjectRoot -InternalId $InternalId -Kind pull_request -Value $Url }
            }
        }
    }
    "jira" {
        $j = $cfg.jira
        $projectKey = [string]$j.project_key
        if ([string]::IsNullOrWhiteSpace($projectKey)) { throw "TRACKER_BLOCKED: jira.project_key ausente." }
        if ($Action -eq "discover") {
            $result = Invoke-JiraRequest "GET" "/rest/api/3/myself"
        } elseif ($Action -eq "list") {
            $jql = if ([string]::IsNullOrWhiteSpace($Query)) { "project = $projectKey ORDER BY updated DESC" } else { $Query }
            $result = Invoke-JiraRequest "POST" "/rest/api/3/search/jql" @{ jql=$jql; maxResults=50; fields=@("summary","status","assignee","priority","issuetype") }
        } elseif ($Action -eq "get") {
            if ([string]::IsNullOrWhiteSpace($ExternalId)) { throw "ExternalId obrigatório" }
            $result = Invoke-JiraRequest "GET" "/rest/api/3/issue/$ExternalId"
        } elseif ($Action -eq "create") {
            if ([string]::IsNullOrWhiteSpace($Title)) { throw "Title obrigatório" }
            $issueType = if ([string]::IsNullOrWhiteSpace([string]$j.issue_type)) { "Task" } else { [string]$j.issue_type }
            $fields = @{ project=@{key=$projectKey}; summary=$Title; issuetype=@{name=$issueType} }
            if (-not [string]::IsNullOrWhiteSpace($Body)) { $fields.description = ConvertTo-Adf $Body }
            $payload = @{ fields=$fields }
            $result = Invoke-JiraRequest "POST" "/rest/api/3/issue" $payload
            if (-not $DryRun -and $null -ne $result.key) {
                $base = ([string]$j.base_url).TrimEnd('/')
                $resolvedExternalId = [string]$result.id
                $resolvedExternalKey = [string]$result.key
                $resolvedUrl = "$base/browse/$($result.key)"
                & $traceScript -ProjectRoot $ProjectRoot -Action link-external -Provider jira -ExternalId $resolvedExternalId -ExternalKey $resolvedExternalKey -Url $resolvedUrl | Out-Null
            }
        } elseif ($Action -eq "update") {
            if ([string]::IsNullOrWhiteSpace($ExternalId)) { throw "ExternalId obrigatório" }
            $fields = @{}
            if (-not [string]::IsNullOrWhiteSpace($Title)) { $fields.summary = $Title }
            if (-not [string]::IsNullOrWhiteSpace($Body)) { $fields.description = ConvertTo-Adf $Body }
            $result = Invoke-JiraRequest "PUT" "/rest/api/3/issue/$ExternalId" @{ fields=$fields }
        } elseif ($Action -eq "comment") {
            if ([string]::IsNullOrWhiteSpace($ExternalId) -or [string]::IsNullOrWhiteSpace($Body)) { throw "ExternalId e Body obrigatórios" }
            $result = Invoke-JiraRequest "POST" "/rest/api/3/issue/$ExternalId/comment" @{ body=(ConvertTo-Adf $Body) }
        } elseif ($Action -eq "transition") {
            if ([string]::IsNullOrWhiteSpace($ExternalId) -or [string]::IsNullOrWhiteSpace($Status)) { throw "ExternalId e Status obrigatórios" }
            Ensure-TerminalStatusAllowed $Status ([string]$j.done_status)
            $transitions = Invoke-JiraRequest "GET" "/rest/api/3/issue/$ExternalId/transitions"
            $target = @($transitions.transitions | Where-Object { ([string]$_.name).Equals($Status,[StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1)
            if ($target.Count -eq 0) { throw "Transição Jira não encontrada: $Status" }
            $result = Invoke-JiraRequest "POST" "/rest/api/3/issue/$ExternalId/transitions" @{ transition=@{ id=[string]$target[0].id } }
        } elseif ($Action -eq "link-pr") {
            if ([string]::IsNullOrWhiteSpace($ExternalId) -or [string]::IsNullOrWhiteSpace($Url)) { throw "ExternalId e Url obrigatórios" }
            $result = Invoke-JiraRequest "POST" "/rest/api/3/issue/$ExternalId/comment" @{ body=(ConvertTo-Adf "Linked pull request: $Url") }
            if (-not $DryRun) {
                & $traceScript -ProjectRoot $ProjectRoot -Action link-pr -Provider jira -ExternalId $ExternalId -Url $Url | Out-Null
                if (-not [string]::IsNullOrWhiteSpace($InternalId)) { Update-NormalizedWorkItemLink -ProjectRoot $ProjectRoot -InternalId $InternalId -Kind pull_request -Value $Url }
            }
        }
    }
    "linear" {
        $l = $cfg.linear
        $teamId = [string]$l.team_id
        if ([string]::IsNullOrWhiteSpace($teamId)) { throw "TRACKER_BLOCKED: linear.team_id ausente." }
        if ($Action -eq "discover") {
            $result = Invoke-Linear 'query { viewer { id name email } }'
        } elseif ($Action -eq "list") {
            $result = Invoke-Linear 'query($teamId:String!){ team(id:$teamId){ issues(first:50){ nodes { id identifier title url priority state { id name } assignee { id name } } } } }' @{ teamId=$teamId }
        } elseif ($Action -eq "get") {
            if ([string]::IsNullOrWhiteSpace($ExternalId)) { throw "ExternalId obrigatório (UUID Linear)" }
            $result = Invoke-Linear 'query($id:String!){ issue(id:$id){ id identifier title description url priority state { id name } assignee { id name } } }' @{ id=$ExternalId }
        } elseif ($Action -eq "create") {
            if ([string]::IsNullOrWhiteSpace($Title)) { throw "Title obrigatório" }
            $input = @{ teamId=$teamId; title=$Title; description=$Body }
            if (-not [string]::IsNullOrWhiteSpace([string]$l.project_id)) { $input.projectId = [string]$l.project_id }
            $result = Invoke-Linear 'mutation($input:IssueCreateInput!){ issueCreate(input:$input){ success issue { id identifier title url } } }' @{ input=$input }
            if (-not $DryRun -and $null -ne $result.issueCreate.issue) {
                $i = $result.issueCreate.issue
                $resolvedExternalId = [string]$i.id
                $resolvedExternalKey = [string]$i.identifier
                $resolvedUrl = [string]$i.url
                & $traceScript -ProjectRoot $ProjectRoot -Action link-external -Provider linear -ExternalId $resolvedExternalId -ExternalKey $resolvedExternalKey -Url $resolvedUrl | Out-Null
            }
        } elseif ($Action -eq "update") {
            if ([string]::IsNullOrWhiteSpace($ExternalId)) { throw "ExternalId obrigatório (UUID Linear)" }
            $input = @{}
            if (-not [string]::IsNullOrWhiteSpace($Title)) { $input.title=$Title }
            if (-not [string]::IsNullOrWhiteSpace($Body)) { $input.description=$Body }
            $result = Invoke-Linear 'mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id,input:$input){ success issue { id identifier title url } } }' @{ id=$ExternalId; input=$input }
        } elseif ($Action -eq "comment") {
            if ([string]::IsNullOrWhiteSpace($ExternalId) -or [string]::IsNullOrWhiteSpace($Body)) { throw "ExternalId e Body obrigatórios" }
            $result = Invoke-Linear 'mutation($input:CommentCreateInput!){ commentCreate(input:$input){ success comment { id } } }' @{ input=@{ issueId=$ExternalId; body=$Body } }
        } elseif ($Action -eq "transition") {
            if ([string]::IsNullOrWhiteSpace($ExternalId) -or [string]::IsNullOrWhiteSpace($Status)) { throw "ExternalId e Status obrigatórios" }
            Ensure-TerminalStatusAllowed $Status ([string]$l.done_status)
            $states = Invoke-Linear 'query { workflowStates { nodes { id name } } }'
            $targets = @($states.workflowStates.nodes | Where-Object { ([string]$_.name).Equals($Status,[StringComparison]::OrdinalIgnoreCase) })
            if ($targets.Count -eq 0) { throw "Estado Linear não encontrado: $Status" }
            if ($targets.Count -gt 1) { throw "Estado Linear ambíguo por nome '$Status'. Use um nome único no workspace ou configure uma política de status mais específica." }
            $result = Invoke-Linear 'mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id,input:$input){ success issue { id identifier state { id name } } } }' @{ id=$ExternalId; input=@{ stateId=[string]$targets[0].id } }
        } elseif ($Action -eq "link-pr") {
            if ([string]::IsNullOrWhiteSpace($ExternalId) -or [string]::IsNullOrWhiteSpace($Url)) { throw "ExternalId e Url obrigatórios" }
            $result = Invoke-Linear 'mutation($input:CommentCreateInput!){ commentCreate(input:$input){ success comment { id } } }' @{ input=@{ issueId=$ExternalId; body="Linked pull request: $Url" } }
            if (-not $DryRun) {
                & $traceScript -ProjectRoot $ProjectRoot -Action link-pr -Provider linear -ExternalId $ExternalId -Url $Url | Out-Null
                if (-not [string]::IsNullOrWhiteSpace($InternalId)) { Update-NormalizedWorkItemLink -ProjectRoot $ProjectRoot -InternalId $InternalId -Kind pull_request -Value $Url }
            }
        }
    }
    default { throw "Provider não suportado: $provider" }
}

$workItemPath = $null
if (-not [string]::IsNullOrWhiteSpace($InternalId) -and -not $DryRun) {
    $workItemPath = Upsert-NormalizedWorkItem -ProjectRoot $ProjectRoot -InternalId $InternalId -Provider $provider -ExternalId $resolvedExternalId -ExternalKey $resolvedExternalKey -Url $resolvedUrl -Title $resolvedTitle -ExternalStatus $resolvedExternalStatus
}
if (-not $DryRun) {
    $syncStatus = if ($Action -eq "discover") { "DISCOVERED" } else { "SYNCED" }
    Update-ControlWorkManagement -ProjectRoot $ProjectRoot -Provider $provider -SyncStatus $syncStatus -ExternalId $resolvedExternalId -ExternalKey $resolvedExternalKey -Url $resolvedUrl
}
Add-AuditEvent -ProjectRoot $ProjectRoot -EventType "work-management.$Action" -Actor "tracker-operator" -Plane "delivery" -Action $Action -Status "OBSERVED" -Metadata @{ provider=$provider; external_id=$resolvedExternalId; internal_id=$InternalId; status=$Status; url=$Url; dry_run=$DryRun } | Out-Null
[ordered]@{
    provider = $provider
    action = $Action
    work_item_file = $workItemPath
    result = $result
} | ConvertTo-Json -Depth 30
