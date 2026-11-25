const OpenAI = require('openai');

let client;
function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY manquante');
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    });
  }
  return client;
}
const model = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';

function summaryMessages(book) {
  return [
    { role: 'system', content: 'Tu es un expert en littérature. Tu génères des résumés concis et accrocheurs pour des fiches de bibliothèque. Réponds toujours en français. Maximum 3 phrases.' },
    { role: 'user', content: `Génère un résumé pour le livre intitulé "${book.title}" écrit par ${book.first_name} ${book.last_name}, publié en ${book.year}.` },
  ];
}

async function generateSummary(book) {
  const r = await getClient().chat.completions.create({ model: model(), messages: summaryMessages(book), max_tokens: 300 });
  return { text: r.choices[0].message.content.trim(), model: model() };
}

async function* streamSummary(book) {
  const stream = await getClient().chat.completions.create({ model: model(), messages: summaryMessages(book), max_tokens: 300, stream: true });
  for await (const chunk of stream) {
    const t = chunk.choices[0]?.delta?.content;
    if (t) yield t;
  }
}

async function extractKeywords(query) {
  const r = await getClient().chat.completions.create({
    model: model(),
    messages: [
      { role: 'system', content: 'Extrais 2 à 5 mots-clés pertinents (titre, sujet, auteur, langage) de la demande. Réponds UNIQUEMENT avec un tableau JSON de chaînes, sans markdown.' },
      { role: 'user', content: query },
    ],
    max_tokens: 100,
  });
  const raw = r.choices[0].message.content.replace(/```json|```/g, '').trim();
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error('Réponse LLM invalide');
  return arr.map(String);
}

module.exports = { generateSummary, streamSummary, extractKeywords, model };
