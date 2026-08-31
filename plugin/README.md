# ADE 6.1.0 OpenCode plugin

Native OpenCode V2 Promise plugin for the ADE durable engineering runtime. The kernel owns durable workflow state and creates disposable ANALYST/BUILDER/VERIFIER/REVIEWER sessions. For beta-18743, worker system context uses canonical `SystemPart`, prompt admission is not output evidence, canonical assistant evidence must be settled via `time.completed`, and the host event stream provides advisory live worker visibility.
