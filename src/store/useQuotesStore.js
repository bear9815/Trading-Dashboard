import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

const DEFAULT_QUOTES = [
  // Jesse Livermore
  { id: 'jl-1', text: "The market is never wrong. Opinions often are.", author: "Jesse Livermore", custom: false, active: true },
  { id: 'jl-2', text: "A loss never bothers me after I take it. I forget it overnight. But being wrong — not taking the loss — that is what does damage to the pocketbook and to the soul.", author: "Jesse Livermore", custom: false, active: true },
  { id: 'jl-3', text: "There is only one side to the stock market — the right side. It is not the bull side or the bear side, but the right side.", author: "Jesse Livermore", custom: false, active: true },
  { id: 'jl-4', text: "Do not anticipate and move without market confirmation — being a little late in your trade is your insurance that you are right.", author: "Jesse Livermore", custom: false, active: true },
  { id: 'jl-5', text: "The big money is made by sitting, not thinking.", author: "Jesse Livermore", custom: false, active: true },
  { id: 'jl-6', text: "Men who can both be right and sit tight are uncommon.", author: "Jesse Livermore", custom: false, active: true },

  // Stanley Druckenmiller
  { id: 'sd-1', text: "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.", author: "Stanley Druckenmiller", custom: false, active: true },
  { id: 'sd-2', text: "Soros has taught me that when you have tremendous conviction on a trade, you have to go for the jugular. It takes courage to be a pig.", author: "Stanley Druckenmiller", custom: false, active: true },
  { id: 'sd-3', text: "I've learned many things from George Soros, but perhaps the most significant is that it's not whether you're right or wrong — it's how much you make when you're right.", author: "Stanley Druckenmiller", custom: false, active: true },
  { id: 'sd-4', text: "The way to build superior long-term returns is through preservation of capital and home runs.", author: "Stanley Druckenmiller", custom: false, active: true },
  { id: 'sd-5', text: "I never use value metrics to time the market. I use liquidity and I use momentum.", author: "Stanley Druckenmiller", custom: false, active: true },

  // Paul Tudor Jones
  { id: 'ptj-1', text: "Don't focus on making money; focus on protecting what you have.", author: "Paul Tudor Jones", custom: false, active: true },
  { id: 'ptj-2', text: "The most important rule of trading is to play great defense, not great offense.", author: "Paul Tudor Jones", custom: false, active: true },
  { id: 'ptj-3', text: "I believe the very best money is made at the market turns. Everyone says you get killed trying to pick tops and bottoms — that is speculative nonsense.", author: "Paul Tudor Jones", custom: false, active: true },
  { id: 'ptj-4', text: "Every day I assume every position I have is wrong. I know where my stop risk points are. The position size is small enough that a move to my stop won't kill me.", author: "Paul Tudor Jones", custom: false, active: true },
  { id: 'ptj-5', text: "Losers average losers.", author: "Paul Tudor Jones", custom: false, active: true },
  { id: 'ptj-6', text: "Where you want to be is always in control, never wishing, always trading, and always, first and foremost, protecting your butt.", author: "Paul Tudor Jones", custom: false, active: true },

  // Mark Douglas
  { id: 'md-1', text: "The consistency you seek is in your mind, not in the markets.", author: "Mark Douglas", custom: false, active: true },
  { id: 'md-2', text: "The hard, cold reality of trading is that every trade has an uncertain outcome.", author: "Mark Douglas", custom: false, active: true },
  { id: 'md-3', text: "If you can learn to create a state of mind that is not affected by the market's behavior, the struggle will cease to exist.", author: "Mark Douglas", custom: false, active: true },
  { id: 'md-4', text: "The best traders have developed a trading persona that gives them the mental flexibility to flow with the market's behavior.", author: "Mark Douglas", custom: false, active: true },
  { id: 'md-5', text: "You don't need to know what's going to happen next in order to make money. Anything can happen. Every moment in the market is unique.", author: "Mark Douglas", custom: false, active: true },
  { id: 'md-6', text: "Accepting the risk means accepting the consequences of your trades without emotional discomfort or resistance.", author: "Mark Douglas", custom: false, active: true },

  // Jared Tendler
  { id: 'jt-1', text: "The biggest enemy to great trading is emotional decision-making. Master your mind, master your trading.", author: "Jared Tendler", custom: false, active: true },
  { id: 'jt-2', text: "Tilt is not a character flaw — it's a learning problem. You can fix learning problems.", author: "Jared Tendler", custom: false, active: true },
  { id: 'jt-3', text: "Performance problems aren't about weakness. They're about unresolved learning issues showing up under pressure.", author: "Jared Tendler", custom: false, active: true },
  { id: 'jt-4', text: "Variance is real. Your job isn't to eliminate it — it's to ensure your skill exceeds it over time.", author: "Jared Tendler", custom: false, active: true },
  { id: 'jt-5', text: "The goal isn't to be emotionless. It's to have emotions that are proportional and functional.", author: "Jared Tendler", custom: false, active: true },

  // Rande Howell
  { id: 'rh-1', text: "Fear-based trading and greed-based trading have one thing in common: they are both driven by the avoidance of discomfort rather than the pursuit of excellence.", author: "Rande Howell", custom: false, active: true },
  { id: 'rh-2', text: "The markets are a mirror of your psychology. Trade yourself first, then the market.", author: "Rande Howell", custom: false, active: true },
  { id: 'rh-3', text: "You cannot trade better than the quality of the mind you bring to trading.", author: "Rande Howell", custom: false, active: true },
  { id: 'rh-4', text: "Uncertainty is the nature of trading. Your job is to manage your reaction to uncertainty — not to eliminate it.", author: "Rande Howell", custom: false, active: true },
  { id: 'rh-5', text: "The trader who masters his emotional state masters the market's influence over his decisions.", author: "Rande Howell", custom: false, active: true },
]

export const useQuotesStore = create(
  persist(
    (set, get) => ({
      quotes: DEFAULT_QUOTES,

      addQuote: (text, author) => set(s => ({
        quotes: [...s.quotes, { id: uuidv4(), text, author: author || 'Me', custom: true, active: true }]
      })),

      removeQuote: (id) => set(s => ({
        quotes: s.quotes.filter(q => q.id !== id)
      })),

      toggleQuote: (id) => set(s => ({
        quotes: s.quotes.map(q => q.id === id ? { ...q, active: !q.active } : q)
      })),

      setAllActive: (active) => set(s => ({
        quotes: s.quotes.map(q => ({ ...q, active }))
      })),

      setAuthorActive: (author, active) => set(s => ({
        quotes: s.quotes.map(q => q.author === author ? { ...q, active } : q)
      })),

      getActiveQuotes: () => get().quotes.filter(q => q.active),
    }),
    { name: 'risk-tool-quotes' }
  )
)
