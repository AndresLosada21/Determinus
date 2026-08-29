# Paralelismo

Paralelize somente trabalho independente: pesquisa de fontes distintas, exploração de áreas desacopladas, reviews independentes.

Não paralelize mutações concorrentes nos mesmos arquivos nem decisões que dependem do resultado umas das outras.

Padrão: no máximo 3 especialistas concorrentes por onda. Mais do que isso exige justificativa porque aumenta custo, duplicação e risco de conflito.
