# Perfis de roteamento

## LEAN
Use para mudanças pequenas, locais, reversíveis e de baixo risco. Evite PO/PM cerimonial quando não há decisão de produto/entrega. Engineering pode usar apenas explorer + implementer + verifier conforme necessidade.

## STANDARD
Padrão para features, bugs relevantes e mudanças com várias partes. Product/Delivery quando aplicáveis; Engineering Lead coordena 1-3 especialistas por onda; verificação independente antes da aceitação.

## HIGH_ASSURANCE
Use em auth, autorização, dados sensíveis, pagamentos, migrações, infra crítica, APIs públicas, compliance ou blast radius alto. Exige contratos completos, verifier, reviewer, normalmente security-reviewer, integração/rollback e evidência executada.

Não escolha perfil pelo tamanho em linhas; escolha pelo risco e reversibilidade.
