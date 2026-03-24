/**
 * Enriches a trade with derived / calculated fields:
 *
 *  1. takeProfit  — 2× initial risk target if not already set
 *                   Long:  entry + 2 × (entry − stop)
 *                   Short: entry − 2 × (stop  − entry)
 *
 *  2. rMultiple   — actual P&L ÷ 1R dollar risk
 *                   1R = |entry − stop| × positionSize
 *
 *  3. riskReward  — planned reward ÷ risk (using the target price)
 *
 *  4. plPct       — P&L as % of capital deployed (buyAmount)
 *
 * Existing non-null values are NEVER overwritten, so user edits are preserved.
 */
export function enrichTrade(trade) {
  if (!trade) return trade
  const result = { ...trade }

  const entry = result.entryPrice
  const stop  = result.stopLoss
  const size  = Math.abs(result.positionSize || 0)
  const pl    = result.pl
  const isShort = (result.position || 'Long').toLowerCase().includes('short')

  // ── 0. Snapshot original stop loss (frozen on first entry, never overwritten) ─
  // Mirrors _originalPositionSize — lets us always compute R vs the true initial
  // risk even after the user trails the stop or partially closes the position.
  if (result._originalStopLoss == null && stop != null) {
    result._originalStopLoss = stop
  }

  // ── 1. 2R auto-target ────────────────────────────────────────────────────
  if (result.takeProfit == null && entry != null && stop != null) {
    const riskPerShare = isShort ? stop - entry : entry - stop
    if (riskPerShare > 0) {
      result.takeProfit = isShort
        ? entry - 2 * riskPerShare   // Short: target is below entry
        : entry + 2 * riskPerShare   // Long:  target is above entry
      result.takeProfit = Math.round(result.takeProfit * 100) / 100
    }
  }

  // ── 2. R-multiple from actual P&L ────────────────────────────────────────
  // Always use the ORIGINAL stop loss and ORIGINAL position size so that:
  //  • Trailing the stop never inflates R (denominator stays fixed)
  //  • Multiple/partial exits sum their P&L against the full original risk
  if (result.rMultiple == null && entry != null && stop != null && pl != null && size > 0) {
    const origStop = result._originalStopLoss ?? stop
    const origSize = result._originalPositionSize ?? size
    const riskPerShare = Math.abs(entry - origStop)
    const oneR = riskPerShare * origSize
    if (oneR > 0) {
      result.rMultiple = Math.round((pl / oneR) * 1000) / 1000
    }
  }

  // ── 2b. ATR-based R (rMultipleATR), ATR risk budget, and stop efficiency ──
  // atrValue is the ATR at entry — the basis used to SIZE the position.
  // This gives a second R view where 1R = ATR × originalSize (the full risk
  // budget). When stop is tighter than ATR, rMultipleATR < rMultiple, which
  // correctly shows a smaller hit to the overall system budget.
  if (result.atrValue != null && result.atrValue > 0) {
    const origSize2 = result._originalPositionSize ?? size
    if (origSize2 > 0) {
      result.atrRisk = Math.round(result.atrValue * origSize2 * 100) / 100
      if (pl != null && result.atrRisk > 0) {
        result.rMultipleATR = Math.round((pl / result.atrRisk) * 1000) / 1000
      }
    }
    // Stop efficiency: what fraction of 1 ATR is this stop?
    // 1.0 = stop exactly at ATR, 0.5 = stop is half an ATR away, etc.
    if (entry != null && stop != null) {
      const origStop2 = result._originalStopLoss ?? stop
      const stopDist  = Math.abs(entry - origStop2)
      result.stopEfficiency = Math.round((stopDist / result.atrValue) * 1000) / 1000
    }
  }

  // ── 3. Planned Risk:Reward ────────────────────────────────────────────────
  if (result.riskReward == null && entry != null && stop != null && result.takeProfit != null) {
    const risk   = Math.abs(entry - stop)
    const reward = Math.abs(result.takeProfit - entry)
    if (risk > 0) {
      result.riskReward = Math.round((reward / risk) * 100) / 100
    }
  }

  // ── 4. P&L % ─────────────────────────────────────────────────────────────
  if (result.plPct == null && pl != null && result.buyAmount) {
    const cost = Math.abs(result.buyAmount)
    if (cost > 0) result.plPct = Math.round((pl / cost) * 10000) / 100
  }

  // ── 5. Status integrity: correct Win/Loss that contradict actual P&L ─────
  // Only corrects clear contradictions — negative PL tagged Win, or positive
  // PL tagged Loss. Does not touch Open, Scratch, or trades without P&L.
  if (result.pl != null && result.status !== 'Open' && result.status !== 'Scratch') {
    if (result.pl < 0 && result.status === 'Win')  result.status = 'Loss'
    if (result.pl > 0 && result.status === 'Loss') result.status = 'Win'
  }

  // ── 6. Partial exit detection ─────────────────────────────────────────────
  // Runs whenever exits exist, regardless of current status.
  // Uses _originalPositionSize (set once and never changed) so that repeated
  // enrichTrade calls (e.g. recalcAll, updateTrade) are idempotent and don't
  // progressively shrink positionSize on every pass.
  if (result.exits?.length > 0) {
    // Snapshot the original full position size on the very first call.
    // After this it's frozen — partial-close mutations to positionSize won't
    // corrupt the reference on subsequent calls.
    if (result._originalPositionSize == null) {
      result._originalPositionSize = Math.abs(result.positionSize || 0)
    }
    const origSize = result._originalPositionSize

    if (origSize > 0) {
      // Derive share count per exit (stored directly or derived from amount ÷ price)
      const exitedShares = result.exits.reduce((sum, ex) => {
        const sh = ex.shares != null
          ? Math.abs(ex.shares)
          : (ex.amount != null && ex.price != null && Math.abs(ex.price) > 0
              ? Math.round(Math.abs(ex.amount) / Math.abs(ex.price))
              : 0)
        return sum + sh
      }, 0)

      // Always expose remainingShares as a display field (0 = fully closed).
      // We NEVER mutate positionSize — it stays as the original full entry size
      // so that R calculations, buy-amount display, and position records are correct.
      const remaining = Math.max(0, Math.round(origSize - exitedShares))
      result.remainingShares = remaining

      // Helper: sum gross proceeds from exits array
      const calcGross = (exits) => exits.reduce((sum, ex) => {
        if (ex.amount != null) return sum + Math.abs(ex.amount)
        const sh = ex.shares != null ? Math.abs(ex.shares) : 0
        return sum + (ex.price != null ? Math.abs(ex.price) * sh : 0)
      }, 0)
      const calcComm  = (exits) => exits.reduce((sum, ex) => sum + (ex.commission ?? 0), 0)

      // 0.5-share tolerance absorbs floating-point rounding from amount ÷ price
      if (exitedShares > 0 && exitedShares < origSize - 0.5) {
        // ── PARTIAL EXIT: keep Open, recalculate partial P&L ──────────────────
        result.status = 'Open'

        const entry = result.entryPrice
        if (entry != null) {
          const gross     = calcGross(result.exits)
          const totalComm = calcComm(result.exits)
          result.pl = Math.round(
            ((isShort
              ? entry * exitedShares - gross
              : gross - entry * exitedShares
            ) - totalComm) * 100
          ) / 100
        } else {
          result.pl = null
        }

        // R and P&L% only meaningful for a fully closed trade
        result.rMultiple    = null
        result.rMultipleATR = null
        result.plPct        = null

      } else if (exitedShares >= origSize - 0.5 && exitedShares > 0 && result.status === 'Open') {
        // ── FULL EXIT still marked Open: auto-close ───────────────────────────
        // Happens when the user logs the final partial close but forgets to
        // change the status dropdown, or when enrichTrade is called on a trade
        // that was partially closed in a previous session.
        const entry = result.entryPrice
        if (entry != null) {
          const gross     = calcGross(result.exits)
          const totalComm = calcComm(result.exits)
          const plCalc    = Math.round(
            ((isShort
              ? entry * exitedShares - gross
              : gross - entry * exitedShares
            ) - totalComm) * 100
          ) / 100
          result.pl         = plCalc
          result.sellAmount = Math.round((gross - totalComm) * 100) / 100
          result.status     = plCalc > 0 ? 'Win' : plCalc < 0 ? 'Loss' : 'Scratch'

          // Compute R now that we have a final P&L
          const origStop2 = result._originalStopLoss ?? stop
          if (origStop2 != null && origSize > 0) {
            const oneR = Math.abs(entry - origStop2) * origSize
            if (oneR > 0) result.rMultiple = Math.round((plCalc / oneR) * 1000) / 1000
          }
          if (result.atrRisk > 0) {
            result.rMultipleATR = Math.round((plCalc / result.atrRisk) * 1000) / 1000
          }
          if (result.buyAmount > 0) {
            result.plPct = Math.round((plCalc / Math.abs(result.buyAmount)) * 10000) / 100
          }
        }
      }
    }
  }

  return result
}

/**
 * Apply enrichTrade to an array of trades.
 */
export function enrichTrades(trades) {
  return (trades || []).map(enrichTrade)
}
