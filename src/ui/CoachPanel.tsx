import type { Coaching } from '../coach/coach';
import { TIER_INFO, positionDescription } from '../coach/coach';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pctFine = (x: number) => (x < 0.01 ? '<1%' : pct(x));

/** Compact coach line shown next to your cards. Tap to open details. */
export function CoachSummary({ c, onOpen }: { c: Coaching; onOpen: () => void }) {
  const eq = c.equity.equity;
  return (
    <button class="coach-summary" onClick={onOpen}>
      {c.tier && (
        <span class="tier-badge" style={{ background: TIER_INFO[c.tier].color }}>{TIER_INFO[c.tier].label}</span>
      )}
      <div class="eq-row">
        <span class="eq-label">Win {pct(eq)}</span>
        <span class="eq-bar">
          <span class="eq-fill" style={{ width: pct(eq) }} />
          {c.needed !== null && <span class="eq-need" style={{ left: pct(c.needed) }} />}
        </span>
      </div>
      {c.needed !== null ? (
        <div class={`coach-need ${c.callVerdict}`}>
          Need {pct(c.needed)} to call {c.callVerdict === 'good' ? '✓' : '✗'}
        </div>
      ) : (
        <div class="coach-more">Tap for advice ›</div>
      )}
    </button>
  );
}

/** Full coach sheet. */
export function CoachSheet({
  c, handText, position, onClose, onGuide,
}: { c: Coaching; handText: string; position: string; onClose: () => void; onGuide: () => void }) {
  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head">
          <div>
            <div class="sheet-title">{handText}</div>
            {position && <div class="sheet-sub">You're {positionDescription(position)}</div>}
          </div>
          <button class="btn-link" onClick={onClose}>✕</button>
        </div>

        {c.tier && (
          <div class="sheet-block">
            <span class="tier-badge" style={{ background: TIER_INFO[c.tier].color }}>{TIER_INFO[c.tier].label}</span>
            <span class="muted"> {TIER_INFO[c.tier].summary}</span>
          </div>
        )}

        <div class={`sheet-headline ${c.callVerdict}`}>{c.headline}</div>

        <div class="eq-big">
          <div class="eq-big-row">
            <span>Win chance</span>
            <b>{pct(c.equity.equity)}</b>
          </div>
          <span class="eq-bar big">
            <span class="eq-fill" style={{ width: pct(c.equity.equity) }} />
            {c.needed !== null && <span class="eq-need" style={{ left: pct(c.needed) }} />}
          </span>
          {c.needed !== null && (
            <div class="eq-big-row small">
              <span>Needed to call (pot odds)</span>
              <b>{pct(c.needed)}</b>
            </div>
          )}
        </div>

        {c.improve.length > 0 && (
          <div class="sheet-block">
            <div class="sheet-label">Chance to finish with… (by the river)</div>
            {c.improve.map((x) => (
              <div class={`improve-row${x.category === c.madeCategory ? ' made' : ''}`}>
                <span>{x.name}{x.category === c.madeCategory ? ' · now' : ''}</span>
                <span class="improve-bar"><span style={{ width: pct(Math.min(1, x.chance)) }} /></span>
                <b>{pctFine(x.chance)}</b>
              </div>
            ))}
            <div class="muted small">How often each one ends up as your best hand after all five board cards.</div>
          </div>
        )}

        {c.explanation.map((p) => (
          <p class="sheet-p">{p}</p>
        ))}

        <button class="btn btn-secondary" onClick={onGuide}>Open poker guide</button>
      </div>
    </div>
  );
}
