const BASE_ANSWER = Object.freeze({
  tags: [],
  text: '',
  voiceTranscript: '',
  updatedAt: null,
})

export const REVIEW_CONTEXTS = Object.freeze({
  MODEL_BOOK: 'model_book',
  TRADE_REVIEW: 'trade_review',
})

export const MODEL_BOOK_REVIEW_QUESTION_DEFS = Object.freeze([
  {
    id: 'leader_reason',
    label: 'Why was this stock a true leader?',
    helperText: 'Why did this name deserve attention over other candidates?',
    selectionMode: 'multi',
    contexts: [REVIEW_CONTEXTS.MODEL_BOOK, REVIEW_CONTEXTS.TRADE_REVIEW],
    allowText: true,
    allowVoice: true,
    tags: [
      'top group/theme',
      'relative strength leader',
      'leading off lows',
      'earnings/catalyst',
      'institutional quality',
      'theme tailwind',
      'emerging leader',
    ],
  },
  {
    id: 'core_setup',
    label: 'What was the core setup?',
    helperText: 'What primary structure created the opportunity?',
    selectionMode: 'multi',
    contexts: [REVIEW_CONTEXTS.MODEL_BOOK, REVIEW_CONTEXTS.TRADE_REVIEW],
    allowText: true,
    allowVoice: true,
    tags: [
      'tight base',
      'low-volatility contraction',
      'pullback to support',
      'breakout',
      'post-breakout add',
      'early trend resumption',
      'stage 2 continuation',
    ],
  },
  {
    id: 'entry_location',
    label: 'Where was the low-risk entry?',
    helperText: 'Mark the physical entry area on the chart.',
    selectionMode: 'multi',
    contexts: [REVIEW_CONTEXTS.MODEL_BOOK, REVIEW_CONTEXTS.TRADE_REVIEW],
    allowText: true,
    allowVoice: true,
    tags: [
      'near 13 EMA',
      'near 34 EMA',
      'near 65 EMA',
      'surfing 13 EMA',
      'surfing 34 EMA',
      'prior breakout area',
      'trendline support',
    ],
  },
  {
    id: 'entry_quality_reason',
    label: 'What made it low risk?',
    helperText: 'Why was risk clearly defined there?',
    selectionMode: 'multi',
    contexts: [REVIEW_CONTEXTS.MODEL_BOOK, REVIEW_CONTEXTS.TRADE_REVIEW],
    allowText: true,
    allowVoice: true,
    tags: [
      'low-volume pullback',
      'volatility contraction',
      'tight daily closes',
      'clear invalidation level',
      'support kept holding',
      'controlled pullback',
    ],
  },
  {
    id: 'market_group_context',
    label: 'What was the market and group context?',
    helperText: 'What broader conditions helped or complicated the setup?',
    selectionMode: 'multi',
    contexts: [REVIEW_CONTEXTS.MODEL_BOOK, REVIEW_CONTEXTS.TRADE_REVIEW],
    allowText: true,
    allowVoice: true,
    tags: [
      'market uptrend',
      'group strength',
      'theme acceleration',
      'broad leadership',
      'narrow leadership',
      'rotation tailwind',
      'market headwind',
    ],
  },
  {
    id: 'challenge_flaw',
    label: 'What challenge or flaw was present anyway?',
    helperText: 'What imperfection existed even though this became a winner or looked attractive?',
    selectionMode: 'multi',
    contexts: [REVIEW_CONTEXTS.MODEL_BOOK, REVIEW_CONTEXTS.TRADE_REVIEW],
    allowText: true,
    allowVoice: true,
    tags: [
      'weak RS',
      'slightly extended',
      'loose structure',
      'volume not ideal',
      'overhead supply',
      'market pressure',
      'late-stage risk',
    ],
  },
  {
    id: 'hold_press_reason',
    label: 'What made this worth holding or pressing?',
    helperText: 'What behavior justified staying with it or adding to it?',
    selectionMode: 'multi',
    contexts: [REVIEW_CONTEXTS.MODEL_BOOK, REVIEW_CONTEXTS.TRADE_REVIEW],
    allowText: true,
    allowVoice: true,
    tags: [
      'persistent relative strength',
      'orderly pullbacks',
      'strong closes',
      'support held',
      'tight action after breakout',
      'group kept confirming',
      'no character break',
    ],
  },
])

export const TRADE_REVIEW_ONLY_QUESTION_DEFS = Object.freeze([
  {
    id: 'execution_alignment',
    label: 'Did I execute in line with the model?',
    helperText: 'Compare the actual trade to your ideal blueprint.',
    selectionMode: 'single',
    contexts: [REVIEW_CONTEXTS.TRADE_REVIEW],
    allowText: true,
    allowVoice: true,
    tags: ['fully aligned', 'mostly aligned', 'partially aligned', 'poorly aligned'],
  },
  {
    id: 'main_execution_leak',
    label: 'What was the main execution leak?',
    helperText: 'What most hurt this trade relative to the model?',
    selectionMode: 'single',
    contexts: [REVIEW_CONTEXTS.TRADE_REVIEW],
    allowText: true,
    allowVoice: true,
    tags: [
      'entry too early',
      'chased entry',
      'sized too large',
      'sized too small',
      'sold too early',
      'held through character break',
      'ignored market context',
      'ignored weak RS',
      'no major leak',
    ],
  },
  {
    id: 'trade_review_verdict',
    label: 'Overall review verdict',
    helperText: 'Give the trade a clean final judgment.',
    selectionMode: 'single',
    contexts: [REVIEW_CONTEXTS.TRADE_REVIEW],
    allowText: true,
    allowVoice: true,
    tags: [
      'A setup, A execution',
      'A setup, B/C execution',
      'B setup, good execution',
      'good idea, poor execution',
      'non-model trade',
    ],
  },
])

export const MODEL_BOOK_REVIEW_QUESTION_IDS = Object.freeze(
  MODEL_BOOK_REVIEW_QUESTION_DEFS.map(question => question.id)
)

export const MODEL_BOOK_QUESTION_IDS = Object.freeze(
  MODEL_BOOK_REVIEW_QUESTION_DEFS
    .filter(question => question.contexts.includes(REVIEW_CONTEXTS.MODEL_BOOK))
    .map(question => question.id)
)

export const TRADE_REVIEW_ONLY_QUESTION_IDS = Object.freeze(
  TRADE_REVIEW_ONLY_QUESTION_DEFS.map(question => question.id)
)

const ALL_QUESTIONS = Object.freeze([
  ...MODEL_BOOK_REVIEW_QUESTION_DEFS,
  ...TRADE_REVIEW_ONLY_QUESTION_DEFS,
])

export function getReviewQuestionsForContext(context = REVIEW_CONTEXTS.MODEL_BOOK) {
  return ALL_QUESTIONS.filter(question => question.contexts.includes(context))
}

export function createEmptyReviewAnswer() {
  return {
    tags: [],
    text: '',
    voiceTranscript: '',
    updatedAt: null,
  }
}

export function createEmptyReviewAnswers(context = REVIEW_CONTEXTS.MODEL_BOOK) {
  return Object.fromEntries(
    getReviewQuestionsForContext(context).map(question => [question.id, createEmptyReviewAnswer()])
  )
}

export function normalizeReviewAnswer(answer = {}) {
  return {
    tags: Array.isArray(answer.tags) ? answer.tags.filter(Boolean) : BASE_ANSWER.tags,
    text: typeof answer.text === 'string' ? answer.text : BASE_ANSWER.text,
    voiceTranscript: typeof answer.voiceTranscript === 'string' ? answer.voiceTranscript : BASE_ANSWER.voiceTranscript,
    updatedAt: typeof answer.updatedAt === 'string' ? answer.updatedAt : BASE_ANSWER.updatedAt,
  }
}
