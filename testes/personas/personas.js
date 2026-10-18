// Os personagens. Cada um tem o mundo onde vive, a língua, o ofício (quando atende),
// a conversa que o "microfone" vai devolver e as perguntas que faria ao Vox.
module.exports = {
  medica: {
    titulo: 'Dra. Sarah Mitchell, médica de família (EUA), app em inglês',
    sid: 'consultas', lang: 'en', oficio: 'saude', pessoa: 'Daniel Reyes', pessoas: 3,
    palavras: 'lisinopril, metformin, A1C, hypertension',
    falas: [
      ['A', 'Hi Daniel, good to see you again. And you brought your wife today, hi Maria. So what brings you in?'],
      ['B', 'Mostly the headaches. They come in the morning, maybe four days a week, and I have been checking my blood pressure at home like you said.'],
      ['A', 'Okay. What numbers have you been getting?'],
      ['B', 'Usually around one fifty over ninety five. One day it was one sixty two.'],
      ['C', 'He also stopped the lisinopril for about a week because he said it made him cough.'],
      ['A', 'That is important, thank you. Daniel, the cough is a known side effect. We can switch you to losartan, which usually does not cause it. Are you still taking metformin twice a day?'],
      ['B', 'Yes, that one I take every day.'],
      ['A', 'Your A1C last time was seven point eight. I want to recheck it today with a basic metabolic panel. Any chest pain, shortness of breath or vision changes with the headaches?'],
      ['B', 'No chest pain. Sometimes the vision is a little blurry in the morning.'],
      ['A', 'Okay. Blood pressure here today is one fifty eight over ninety eight. Plan: stop lisinopril, start losartan fifty milligrams once a day, labs today, keep the home log, and come back in four weeks. If you get chest pain or the vision gets worse, go to the emergency room.'],
      ['C', 'Should he cut salt too?'],
      ['A', 'Yes, less than two grams of sodium a day. I will print a sheet for you.']
    ],
    perguntas: ['How do I send the visit summary to the patient?', 'Is this HIPAA compliant?']
  },
  psicologa: {
    titulo: 'Helena Duarte, psicóloga clínica (Brasil), app em português',
    sid: 'consultas', lang: 'pt', oficio: 'psico', pessoa: 'Marina S.', pessoas: 2,
    palavras: 'ansiedade, TCC, ruminação, insônia',
    falas: [
      ['A', 'Oi Marina, como você chegou hoje?'],
      ['B', 'Cansada. Dormi umas quatro horas. Fiquei a noite inteira pensando na reunião com a minha chefe.'],
      ['A', 'Me conta um pouco mais desse pensamento que não deixava você dormir.'],
      ['B', 'Que eu vou ser demitida. Que todo mundo já percebeu que eu não dou conta. Eu fico repassando cada frase que eu falei.'],
      ['A', 'Você percebe que é parecido com aquilo que a gente chamou de ruminação, na semana passada?'],
      ['B', 'Percebo. Mas na hora não consigo parar. E teve uma noite que eu pensei que seria mais fácil sumir de tudo.'],
      ['A', 'Obrigada por me contar isso. Quando você diz sumir, você pensou em se machucar ou em tirar a sua vida?'],
      ['B', 'Não, não. Era mais vontade de fugir, largar tudo. Não pensei em me machucar.'],
      ['A', 'Combinado. Se esse pensamento mudar, você me liga ou liga para o CVV, 188, a qualquer hora. Para esta semana, vamos manter o registro de pensamentos e você tenta a técnica de adiar a preocupação para as sete da noite.'],
      ['B', 'Tá. Eu tento.'],
      ['A', 'Nos vemos na quinta, mesmo horário.']
    ],
    ditado: 'Sessão 6 com a Marina. Paciente chegou com sono prejudicado, ruminação sobre desempenho no trabalho. Relatou ideação de fuga, sem ideação suicida, sem plano, avaliado em sessão. Mantido registro de pensamentos e técnica de adiamento da preocupação. Hipótese de trabalho segue ansiedade generalizada. Próxima sessão quinta.',
    perguntas: ['Como deixo as anotações com senha?', 'Posso gravar a sessão sem a paciente saber?']
  },
  terapeuta: {
    titulo: 'Mark Owens, terapeuta de casal (EUA), app em inglês, 3 vozes',
    sid: 'consultas', lang: 'en', oficio: 'psico', pessoa: 'Jordan & Alex', pessoas: 3,
    palavras: 'Gottman, repair attempt, stonewalling',
    falas: [
      ['A', 'Last week we agreed on a fifteen minute check in every evening. How did that go?'],
      ['B', 'We did it twice. The third time Alex was on the phone the whole time.'],
      ['C', 'That is not fair. It was a work call, I told you that before dinner.'],
      ['A', 'Let me slow this down. Jordan, what did you feel when the phone came out?'],
      ['B', 'Like I was not a priority. Again.'],
      ['C', 'And when Jordan says again, I just shut down. I stop talking.'],
      ['A', 'That shutting down is what we called stonewalling. Alex, can you tell Jordan what happens in your body right then?'],
      ['C', 'My chest gets tight. I want to leave the room.'],
      ['A', 'Thank you. For this week, when either of you feels flooded, say pause, take twenty minutes, and then come back. Jordan, the check in moves to after the call, not before dinner.'],
      ['B', 'Okay. I can try that.'],
      ['C', 'Me too.']
    ],
    perguntas: ['This is a couple, how do I keep one file for both of them?']
  },
  fisio: {
    titulo: 'Rodrigo Lima, fisioterapeuta (Brasil), no celular, app em português',
    sid: 'consultas', lang: 'pt', oficio: null, pessoa: 'Seu Antônio', pessoas: 2, mobile: true,
    palavras: 'LCA, flexão, extensão, EVA, quadríceps',
    falas: [
      ['A', 'Bom dia seu Antônio, de zero a dez, quanto está a dor no joelho hoje?'],
      ['B', 'Hoje tá uns quatro. Semana passada tava seis.'],
      ['A', 'Ótimo, melhorou. Vamos medir a flexão. Pode dobrar até onde der. Isso, segura. Noventa e oito graus. Na sessão passada foi noventa e dois.'],
      ['B', 'Dói quando passa daí.'],
      ['A', 'Normal, oito semanas de cirurgia de LCA. Extensão completa, zero grau. Agora três séries de doze de agachamento na parede, e depois a bicicleta dez minutos sem carga.'],
      ['B', 'Em casa eu fiz os exercícios só três dias.'],
      ['A', 'Tem que ser todo dia, seu Antônio. Elevação da perna estendida, três de quinze, e gelo vinte minutos depois. Se inchar, me manda mensagem.'],
      ['B', 'Tá bom. Volto na quinta?'],
      ['A', 'Quinta, mesma hora. Faltam quatro sessões do pacote.']
    ],
    modelo: { nome: 'Evolução fisio', topicos: ['Dor (0 a 10)', 'Amplitude de movimento', 'Exercícios feitos (séries x repetições)', 'Exercícios para casa', 'Próxima sessão'] },
    perguntas: ['Como vejo a evolução da dor do paciente nas sessões?']
  },
  jornalista: {
    titulo: 'Priya Nair, jornalista (EUA), mundo Entrevistas, app em inglês',
    sid: 'entrevistas', lang: 'en', pessoa: 'Tom Hale (source)', pessoas: 2,
    roteiro: 'How long did you work at the plant?\nWhen did you first notice the leak?\nWho did you report it to?',
    palavras: 'Riverside plant, OSHA, EPA',
    falas: [
      ['A', 'Thanks for talking to me, Tom. How long did you work at the Riverside plant?'],
      ['B', 'Eleven years. Maintenance, mostly the cooling towers.'],
      ['A', 'When did you first notice the leak?'],
      ['B', 'March of last year. There was a green film on the creek behind tower three. We all saw it.'],
      ['A', 'Who did you report it to?'],
      ['B', 'My supervisor, then the plant manager, Greg Dunn. He told me, and I quote, nobody needs to know about a little algae.'],
      ['A', 'Did you ever contact the EPA or OSHA?'],
      ['B', 'This part is off the record. I sent an anonymous email to the EPA in May.'],
      ['A', 'Understood, that stays off the record. Back on the record: would you say the company knew?'],
      ['B', 'They knew. Everybody on the night shift knew.']
    ],
    perguntas: ['How do I get the exact time of a quote?']
  },
  gestora: {
    titulo: 'Carla Menezes, gerente de projeto (Brasil), mundo Reuniões, 4 pessoas',
    sid: 'reunioes', lang: 'pt', pessoa: null, pessoas: 4,
    falas: [
      ['A', 'Pessoal, pauta de hoje: atraso na entrega do aplicativo e o orçamento do segundo semestre.'],
      ['B', 'O atraso é de duas semanas. O fornecedor da API de pagamento ainda não liberou o ambiente de testes.'],
      ['C', 'Eu posso cobrar eles hoje. Se até sexta não liberarem, a gente usa o ambiente simulado.'],
      ['A', 'Fechado. Pedro cobra o fornecedor hoje. Decisão: se não liberar até sexta, vamos com o simulado.'],
      ['D', 'Sobre o orçamento, eu preciso do número final até dia vinte para mandar para a diretoria.'],
      ['A', 'Juliana, você me manda a planilha até quarta e eu fecho o número.'],
      ['B', 'E a contratação do segundo desenvolvedor? Ficou para quando?'],
      ['A', 'Isso fica para a próxima reunião, não temos decisão hoje.']
    ],
    perguntas: ['Como mando a ata para todo mundo?']
  },
  estudante: {
    titulo: 'Leo Park, estudante de biologia (EUA), mundo Aulas, app em inglês',
    sid: 'aulas', lang: 'en', pessoa: null, pessoas: 0,
    falas: [
      ['A', 'Okay everyone, today we finish cellular respiration. Remember glycolysis happens in the cytoplasm and gives a net of two ATP.'],
      ['A', 'Then pyruvate goes into the mitochondria. The Krebs cycle runs in the matrix and produces NADH and FADH2.'],
      ['B', 'Professor, is the electron transport chain where most of the ATP comes from?'],
      ['A', 'Exactly. Around thirty two to thirty four ATP come from oxidative phosphorylation. This will be on the midterm, page two hundred and twelve.'],
      ['A', 'For Thursday, read chapter nine and do problems one to six.']
    ],
    perguntas: ['How do I study this for the exam?']
  }
};
