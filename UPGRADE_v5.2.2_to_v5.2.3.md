# Upgrade ADE v5.2.2 → v5.2.4

Use o migrator do release bundle. A v5.2.4 reduz o surface de tools de owners/children e adiciona o contrato `DELEGATION_DRIVEN`.

Após migrar, reinicie o serviço e execute `validate` com seu model. Em seguida execute `assurance --source --model`. Para medir flakiness sem afrouxar asserts, rode `ade.py behavioral-reliability --model <provider/model> --trials 5`.
