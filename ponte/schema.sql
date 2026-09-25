-- Banco da ponte do Vox (Cloudflare D1).
-- Nada aqui identifica uma pessoa: "aparelho" é um código sorteado no próprio
-- aparelho, e o endereço de internet só entra embaralhado (hash com o dia),
-- apagado no dia seguinte. Nenhum áudio e nenhum texto são guardados.

-- Os números que o Rafa ajusta pelo painel. Linha ausente = vale o padrão do código.
CREATE TABLE IF NOT EXISTS ajustes (
  chave TEXT PRIMARY KEY,
  valor INTEGER NOT NULL
);

-- Um aparelho por linha. `cota` é o maior número de cortesias que esse
-- aparelho já viu: aumentar o ajuste vale pra todos, diminuir só pros novos.
CREATE TABLE IF NOT EXISTS aparelhos (
  id TEXT PRIMARY KEY,
  cota INTEGER NOT NULL,
  usadas INTEGER NOT NULL DEFAULT 0,
  criado TEXT NOT NULL,
  ultimo TEXT,
  formou INTEGER NOT NULL DEFAULT 0,
  formou_em TEXT
);

-- Um dia por linha (horário de Brasília). É daqui que sai o painel.
CREATE TABLE IF NOT EXISTS dias (
  dia TEXT PRIMARY KEY,
  segundos INTEGER NOT NULL DEFAULT 0,
  transcricoes INTEGER NOT NULL DEFAULT 0,
  aparelhos_novos INTEGER NOT NULL DEFAULT 0,
  chegaram_ao_fim INTEGER NOT NULL DEFAULT 0,
  formaram INTEGER NOT NULL DEFAULT 0,
  recusa_teto INTEGER NOT NULL DEFAULT 0,
  recusa_esgotada INTEGER NOT NULL DEFAULT 0,
  recusa_ip INTEGER NOT NULL DEFAULT 0,
  recusa_grande INTEGER NOT NULL DEFAULT 0,
  erros INTEGER NOT NULL DEFAULT 0
);

-- Limite por endereço de internet. `hash` já inclui o dia, e as linhas de
-- dias passados são apagadas a cada uso.
CREATE TABLE IF NOT EXISTS ips (
  dia TEXT NOT NULL,
  hash TEXT NOT NULL,
  usos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, hash)
);
