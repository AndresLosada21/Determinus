# Entrega de Produto com IA para OpenCode V2

Organização multi-plano para **Produto**, **Entrega** e **Engenharia** com contratos explícitos e gates de evidência.

Compatível com [OpenCode V2](https://opencode.ai/v2/docs/) (`opencode2`). Coexiste com os agentes nativos `build` e `plan` — este pacote define `orchestrator` como padrão sem desabilitar nenhum agente existente.

## Como funciona

```mermaid
flowchart TD
    A[Intenção humana] --> B[Product Owner<br/>POR QUE / O QUÊ]
    B --> C[Project Manager<br/>QUANDO / ORDEM]
    C --> D[Engineering Lead<br/>COMO / EVIDÊNCIA]
    D --> E[Especialistas<br/>explorer • planner • tester • implementer<br/>verifier • reviewer • ...]
    E --> F[Engineering Acceptance]
    F --> G[Delivery Acceptance]
    G --> H[Product Acceptance]
    H --> I[GLOBAL DONE]
```

A cerimônia escala com o risco: correções triviais passam direto pelo `engineer`; funcionalidades transversais usam o fluxo completo de contratos. Ciclo completo em `skills/ai-driven-engineering/SKILL.md`.

## Organização

```mermaid
graph TD
    ORC[orchestrator<br/>Coordenação — handoffs, gates, status final]

    ORC --> PO[product-owner<br/>Produto]
    ORC --> PM[project-manager<br/>Entrega]
    ORC --> ENG[engineer<br/>Engenharia Lead]

    ENG --> EX[explorer<br/>descoberta de repositório e runtime]
    ENG --> RES[researcher<br/>pesquisa técnica]
    ENG --> MOD[modeler<br/>arquitetura e impacto]
    ENG --> PLAN[engineering-planner<br/>decomposição]
    ENG --> TST[tester<br/>especificação executável]
    ENG --> IMP[implementer<br/>implementação]
    ENG --> VER[verifier<br/>validação independente]
    ENG --> DBG[debugger<br/>diagnóstico]
    ENG --> REV[reviewer<br/>revisão de corretude]
    ENG --> SREV[security-reviewer<br/>revisão de segurança]
    ENG --> INT[integrator<br/>prontidão de integração]
    ENG --> DOC[documenter<br/>documentação técnica]
```

| Plano | Agente | Responsabilidade |
|---|---|---|
| **Coordenação** | `orchestrator` | Orquestra handoffs entre planos e sintetiza o status final. Não edita código nem contratos. |
| **Produto** | `product-owner` | Define problema, outcome, valor, escopo e critérios de aceite. |
| **Entrega** | `project-manager` | Define dependências, ondas de execução, prontidão e gates de entrega. |
| **Engenharia** | `engineer` | Define contrato técnico, delega para especialistas e concede `ENGINEERING_ACCEPTED`. |

O `engineer` atua como **Engineering Lead** — delega implementação para especialistas para manter planejamento, execução e verificação independentes.

## Contratos

Contratos são a única forma de comunicação entre planos — não há suposição implícita.

```mermaid
flowchart LR
    subgraph Produto["Plano de Produto"]
        PC[".ai/product-contract.md<br/>dono: product-owner"]
    end
    subgraph Entrega["Plano de Entrega"]
        DC[".ai/delivery-contract.md<br/>dono: project-manager"]
    end
    subgraph Engenharia["Plano de Engenharia"]
        EC[".ai/engineering-contract.md<br/>dono: engineer"]
    end
    subgraph Estado["Estado"]
        CK[".ai/checkpoint.md"]
        DL[".ai/decision-log.md"]
    end

    PC -->|autorizado| DC
    DC -->|READY| EC
    EC -->|evidência técnica| DC
    DC -->|entregue| PC
    DC -.-> CK
    PC -.-> DL
    DC -.-> DL
    EC -.-> DL
```

| Contrato | Dono | Conteúdo |
|---|---|---|
| **Contrato de Produto** | `product-owner` | Problema, outcome, valor, stakeholders, escopo In/Out, restrições, critérios de aceite, autorização. |
| **Contrato de Entrega** | `project-manager` | Grafo de trabalho, dependências, ondas, riscos, pré-requisitos externos, gates de entrega. |
| **Contrato de Engenharia** | `engineer` | Sistema atual observado, escopo técnico, impacto arquitetural, superfícies de escrita, plano de validação. |

Templates em `skills/ai-driven-engineering/templates/`. Cada contrato possui ciclo de status próprio (ex.: Produto `DRAFT → NEEDS_HUMAN_DECISION → APPROVED → PRODUCT_ACCEPTED`).

## Ciclo de vida completo

```mermaid
flowchart TD
    A[Intenção humana] --> B{Produto}
    B -->|define| B1[Contrato de Produto<br/>WHY / WHAT]
    B1 --> C{Entrega}
    C -->|converte| C1[Contrato de Entrega<br/>WHEN / ORDER]
    C1 --> D{Engenharia}
    D -->|converte| D1[Contrato de Engenharia<br/>HOW / EVIDÊNCIA]

    D1 --> E1[DISCOVER<br/>explorer / researcher]
    E1 --> E2[MODEL<br/>modeler]
    E2 --> E3[PLAN<br/>engineering-planner]
    E3 --> E4[SPEC / TEST<br/>tester]
    E4 --> E5[IMPLEMENT<br/>implementer]
    E5 --> E6[VERIFY<br/>verifier]
    E6 --> E7[REVIEW<br/>reviewer / security-reviewer]
    E7 --> E8[INTEGRATE<br/>integrator]

    E8 --> F[ENGINEERING_ACCEPTED]
    F --> G[DELIVERY_ACCEPTED<br/>project-manager]
    G --> H[PRODUCT_ACCEPTED<br/>product-owner]
    H --> I[GLOBAL DONE]

    E5 -.->|falha incerta| DBG[debugger<br/>REPRODUCE → MINIMIZE → HYPOTHESIZE]
    DBG -.-> E5
    E6 -.->|não validado| E5
```

 Gates preservados: `product-owner` e `project-manager` não chamam especialistas de código; `orchestrator` coordena como siblings.

## Triple Definition of Done

`GLOBAL DONE` só existe quando os três planos aceitam — implementação sem validação ou entrega sem aceite de produto **não** é DONE.

```mermaid
graph TD
    EA["ENGINEERING_ACCEPTED<br/>dono: engineer<br/>escopo técnico + validação + review + integração"]
    DA["DELIVERY_ACCEPTED<br/>dono: project-manager<br/>dependências + gates + CI/release"]
    PA["PRODUCT_ACCEPTED<br/>dono: product-owner<br/>comportamento entregue = critérios do Contrato de Produto"]

    EA --> DONE
    DA --> DONE
    PA --> DONE

    DONE{{"GLOBAL DONE"}}

    EA -.->|pendente| P1["ENGINEERING_ACCEPTED / DELIVERY_PENDING"]
    DA -.->|pendente| P2["DELIVERY_ACCEPTED / PRODUCT_PENDING"]
    EA -.->|bloqueado| B["BLOCKED / PARTIAL / IMPLEMENTED_NOT_VALIDATED"]
```

Estados parciais (`ENGINEERING_ACCEPTED / DELIVERY_PENDING`, `BLOCKED`, `IMPLEMENTED_NOT_VALIDATED`) são reportados explicitamente — nunca forçar confiança além da evidência.

## Requisitos

- OpenCode V2 (`opencode2`) — [instalação](https://opencode.ai/v2/docs/)
- PowerShell 5.1+ / PowerShell 7+ (Windows) ou `pwsh` (macOS/Linux)

## Instalação

Na raiz do pacote:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-opencode.ps1
```

O instalador:

1. Copia os agentes para `~/.config/opencode/agents/`
2. Copia a skill para `~/.config/opencode/skills/ai-driven-engineering/`
3. Cria backup com timestamp de `opencode.json` / `opencode.jsonc`
4. Define `default_agent: "orchestrator"`
5. Define `experimental.subagent_depth: 2` (necessário para `orchestrator → engineer → specialist`)
6. Preserva providers, modelos e definições de MCP existentes

Opções:

```powershell
# Apenas agentes e skill, sem alterar config
.\install-opencode.ps1 -NoConfigPatch

# Mantém o default_agent atual
.\install-opencode.ps1 -NoDefaultAgent
```

Reinicie o OpenCode após instalar para que a descoberta recarregue os novos agentes e a skill.

Para remover:

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall-opencode.ps1
```

## Bootstrap do projeto

Inicializa os templates de contrato em qualquer projeto:

```powershell
# Cria .ai/ no projeto atual (não sobrescreve existentes)
powershell -ExecutionPolicy Bypass -File <pacote>\scripts\bootstrap-project.ps1

# Sobrescreve arquivos existentes
powershell -ExecutionPolicy Bypass -File <pacote>\scripts\bootstrap-project.ps1 -Force
```

Estrutura criada:

```
.ai/
├── product-contract.md        Contrato de Produto
├── delivery-contract.md       Contrato de Entrega
├── engineering-contract.md    Contrato de Engenharia
├── checkpoint.md              Estado da entrega
└── decision-log.md            Decisões entre planos
```

Use `bootstrap` quando for iniciar um delivery estruturado. Para correções triviais, chame `engineer` ou `build` direto sem `.ai`.

## Roteamento no OpenCode V2

O aninhamento ponta a ponta exige profundidade 2:

```mermaid
flowchart TD
    O["orchestrator<br/>primary"]
    E["engineer<br/>child"]
    S["specialist<br/>grandchild<br/>tester / implementer / verifier / ..."]

    O --> E --> S
```

```json
{
  "experimental": {
    "subagent_depth": 2
  }
}
```

`product-owner`, `project-manager` e `engineer` usam `mode: all` e podem ser selecionados diretamente no TUI. `orchestrator` é `mode: primary`; especialistas são `mode: subagent`.

## Agentes nativos

Este pacote **não desabilita** `build` ou `plan`. Ambos continuam disponíveis — troque de agente no TUI ou defina `default_agent` de volta para `build` se preferir. Veja o [guia de Agents](https://opencode.ai/v2/docs/agents).

| Agente nativo | Uso recomendado |
|---|---|
| `build` | Codificação rápida, sem cerimônia |
| `plan` | Planejamento sem implementação (gera `plan/*.md`) |
| `orchestrator` | Delivery ponta a ponta com contratos (padrão deste pacote) |

## Modelos e MCPs

A configuração de providers e MCPs **não é alterada**. Seleção de modelos e roteamento de MCPs são adaptadores sobre a organização e podem ser ajustados por papel sem mudar os contratos.

Exemplos de roteamento (configuração por projeto): design/UI → `implementer`/`verifier`; browser/E2E → `verifier`; infra/cloud → `integrator`; docs → `researcher`/`documenter`; gestão de projeto → `project-manager`.

A skill funciona corretamente mesmo sem nenhum MCP instalado.

## Desinstalação

Remove agentes e skill instalados. Chaves de configuração (`default_agent` / `subagent_depth`) não são revertidas automaticamente — restaure a partir do backup com timestamp se necessário.

## Licença

MIT — veja [LICENSE](LICENSE).
