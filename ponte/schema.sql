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

-- Lentes por nossa conta (07/10/2026). Mesma regra das transcrições: `cota` é o
-- maior número que esse aparelho já viu. Nenhum texto é guardado.
-- (A ponte também cria estas tabelas sozinha no primeiro uso, se faltarem.)
CREATE TABLE IF NOT EXISTS lentes (
  id TEXT PRIMARY KEY,
  cota INTEGER NOT NULL,
  usadas INTEGER NOT NULL DEFAULT 0,
  criado TEXT NOT NULL,
  ultimo TEXT
);
CREATE TABLE IF NOT EXISTS lentes_dias (
  dia TEXT PRIMARY KEY,
  usos INTEGER NOT NULL DEFAULT 0,
  aparelhos INTEGER NOT NULL DEFAULT 0,
  recusas INTEGER NOT NULL DEFAULT 0,
  erros INTEGER NOT NULL DEFAULT 0
);

-- Medição da landing (voxcharmai.com), sem cookie e sem código de terceiros.
-- Só totais por dia. `landing_vis` existe pra contar visitante único e frear
-- abuso: guarda o endereço embaralhado com o dia, apagado no dia seguinte.
CREATE TABLE IF NOT EXISTS landing_dias (
  dia TEXT PRIMARY KEY,
  visitas INTEGER NOT NULL DEFAULT 0,
  visitantes INTEGER NOT NULL DEFAULT 0,
  clique_gratis INTEGER NOT NULL DEFAULT 0,
  clique_assinar INTEGER NOT NULL DEFAULT 0,
  -- Desde 08/10/2026: pessoas que clicaram (uma vez por visitante por dia).
  pessoas_gratis INTEGER NOT NULL DEFAULT 0,
  pessoas_assinar INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS landing_origens (
  dia TEXT NOT NULL,
  origem TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, origem)
);
CREATE TABLE IF NOT EXISTS landing_vis (
  dia TEXT NOT NULL,
  hash TEXT NOT NULL,
  eventos INTEGER NOT NULL DEFAULT 0,
  alvos TEXT NOT NULL DEFAULT '', -- em que botões este visitante já clicou hoje
  PRIMARY KEY (dia, hash)
);

-- Medição opcional do uso do app (08/10/2026). Só de quem disse "sim" no app.
-- `id` é um código sorteado só pra isto (não é o da cortesia). Nenhum texto,
-- áudio, nome ou e-mail. As três primeiras tabelas somem 90 dias depois do
-- último uso, e na hora se a pessoa desligar a medição no app.
-- (A ponte também cria estas tabelas e colunas sozinha no primeiro uso.)
CREATE TABLE IF NOT EXISTS uso_aparelhos (
  id TEXT PRIMARY KEY,
  primeiro TEXT NOT NULL,
  ultimo TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS uso_ativos (
  id TEXT NOT NULL,
  dia TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id, dia)
);
CREATE TABLE IF NOT EXISTS uso_marcos (
  id TEXT NOT NULL,
  passo TEXT NOT NULL,
  dia TEXT NOT NULL,
  PRIMARY KEY (id, passo)
);
-- Totais por dia e por evento, de todo mundo somado (não dizem de quem são).
CREATE TABLE IF NOT EXISTS uso_eventos (
  dia TEXT NOT NULL,
  evento TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, evento)
);
