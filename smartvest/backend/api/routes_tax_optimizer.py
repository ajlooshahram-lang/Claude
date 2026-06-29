"""
Danish Cross-Border Tax Optimization Engine

Handles:
- US dividend withholding (15% treaty rate, reclaim process)
- Danish aktieindkomst progressive rates (27%/42%)
- Aktiesparekonto (ASK) 17% flat tax
- FIFO vs Average Cost basis comparison
- Loss offsetting within tax year
- Year-end optimization checklist
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/tax-optimizer", tags=["tax-optimizer"])

# ─── Danish Tax Constants (2024/2025) ─────────────────────────────────────────

AKTIEINDKOMST_THRESHOLD_SINGLE = 61000  # DKK
AKTIEINDKOMST_THRESHOLD_MARRIED = 122000  # DKK
AKTIEINDKOMST_LOW_RATE = 0.27  # 27%
AKTIEINDKOMST_HIGH_RATE = 0.42  # 42%
ASK_TAX_RATE = 0.17  # 17% flat (lagerbeskatning)
US_TREATY_WITHHOLDING = 0.15  # 15% under DK-US treaty
US_DEFAULT_WITHHOLDING = 0.30  # 30% without W-8BEN
ASK_CONTRIBUTION_LIMIT = 135900  # DKK (2025)


class TradeInput(BaseModel):
    symbol: str
    shares_to_sell: float
    current_price: float
    currency: str = "USD"
    dkk_rate: float = 6.85


class Purchase(BaseModel):
    date: str
    shares: float
    price_per_share: float
    currency: str = "USD"


class TaxOptRequest(BaseModel):
    trade: TradeInput
    purchases: list[Purchase]  # All purchase lots for this stock
    account_type: str = "free"  # "free" or "ask"
    marital_status: str = "single"  # "single" or "married"
    ytd_realized_gains_dkk: float = 0
    ytd_realized_losses_dkk: float = 0
    ytd_dividends_received_dkk: float = 0
    us_withholding_paid_dkk: float = 0


class DividendInput(BaseModel):
    symbol: str
    gross_dividend_usd: float
    dkk_rate: float = 6.85
    account_type: str = "free"
    w8ben_filed: bool = True


class YearEndRequest(BaseModel):
    account_type: str = "free"
    marital_status: str = "single"
    ytd_realized_gains_dkk: float = 0
    ytd_realized_losses_dkk: float = 0
    unrealized_gains_dkk: float = 0
    unrealized_losses_dkk: float = 0
    us_withholding_paid_dkk: float = 0
    ask_value_start_of_year_dkk: float = 0
    ask_value_now_dkk: float = 0


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/sell-analysis")
def analyze_sell_tax(req: TaxOptRequest):
    """Analyze tax implications of selling shares under different methods."""
    sell_price_dkk = req.trade.current_price * req.trade.dkk_rate
    proceeds_dkk = sell_price_dkk * req.trade.shares_to_sell

    threshold = AKTIEINDKOMST_THRESHOLD_MARRIED if req.marital_status == "married" else AKTIEINDKOMST_THRESHOLD_SINGLE

    # Sort purchases by date for FIFO
    sorted_purchases = sorted(req.purchases, key=lambda p: p.date)

    # ─── FIFO Method ──────────────────────────────────────────────────────
    fifo_cost = 0
    shares_remaining = req.trade.shares_to_sell
    fifo_lots_used = []

    for lot in sorted_purchases:
        if shares_remaining <= 0:
            break
        lot_price_dkk = lot.price_per_share * req.trade.dkk_rate
        shares_from_lot = min(shares_remaining, lot.shares)
        fifo_cost += shares_from_lot * lot_price_dkk
        fifo_lots_used.append({"date": lot.date, "shares": shares_from_lot, "price_dkk": round(lot_price_dkk, 2)})
        shares_remaining -= shares_from_lot

    fifo_gain = proceeds_dkk - fifo_cost

    # ─── Average Cost Method ──────────────────────────────────────────────
    total_shares_owned = sum(p.shares for p in req.purchases)
    total_cost_dkk = sum(p.shares * p.price_per_share * req.trade.dkk_rate for p in req.purchases)
    avg_cost_per_share_dkk = total_cost_dkk / total_shares_owned if total_shares_owned > 0 else 0
    avg_cost_basis = avg_cost_per_share_dkk * req.trade.shares_to_sell
    avg_gain = proceeds_dkk - avg_cost_basis

    # ─── Tax Calculations ─────────────────────────────────────────────────
    def calc_tax(gain_dkk: float) -> dict:
        """Calculate tax on a gain under the appropriate account type."""
        if req.account_type == "ask":
            # ASK: 17% flat on all gains (lagerbeskatning)
            tax = max(0, gain_dkk) * ASK_TAX_RATE
            return {"tax_dkk": round(tax, 2), "rate": ASK_TAX_RATE, "method": "ASK 17% flat (lagerbeskatning)"}

        # Free account: progressive aktieindkomst
        if gain_dkk <= 0:
            return {"tax_dkk": 0, "rate": 0, "method": "Loss — no tax owed (can offset future gains)"}

        # Net gains after offsetting losses
        net_gain = gain_dkk - req.ytd_realized_losses_dkk
        if net_gain <= 0:
            return {"tax_dkk": 0, "rate": 0, "method": f"Gain fully offset by {req.ytd_realized_losses_dkk:,.0f} DKK in losses"}

        total_gains = req.ytd_realized_gains_dkk + net_gain

        if req.ytd_realized_gains_dkk >= threshold:
            # All at high rate
            tax = net_gain * AKTIEINDKOMST_HIGH_RATE
            return {"tax_dkk": round(tax, 2), "rate": AKTIEINDKOMST_HIGH_RATE, "method": f"All at 42% (already above {threshold:,} DKK threshold)"}
        elif total_gains <= threshold:
            # All at low rate
            tax = net_gain * AKTIEINDKOMST_LOW_RATE
            return {"tax_dkk": round(tax, 2), "rate": AKTIEINDKOMST_LOW_RATE, "method": f"All at 27% (within {threshold:,} DKK threshold)"}
        else:
            # Split
            low_portion = threshold - req.ytd_realized_gains_dkk
            high_portion = net_gain - low_portion
            tax = low_portion * AKTIEINDKOMST_LOW_RATE + high_portion * AKTIEINDKOMST_HIGH_RATE
            blended = tax / net_gain
            return {"tax_dkk": round(tax, 2), "rate": round(blended, 4), "method": f"Split: {low_portion:,.0f} DKK at 27% + {high_portion:,.0f} DKK at 42%"}

    fifo_tax = calc_tax(fifo_gain)
    avg_tax = calc_tax(avg_gain)

    # ─── Determine which is better ───────────────────────────────────────
    fifo_after_tax = proceeds_dkk - fifo_tax["tax_dkk"]
    avg_after_tax = proceeds_dkk - avg_tax["tax_dkk"]
    better_method = "FIFO" if fifo_after_tax >= avg_after_tax else "Average Cost"
    savings = abs(fifo_after_tax - avg_after_tax)

    return {
        "symbol": req.trade.symbol,
        "shares_sold": req.trade.shares_to_sell,
        "sell_price_dkk": round(sell_price_dkk, 2),
        "proceeds_dkk": round(proceeds_dkk, 2),
        "account_type": req.account_type,
        "fifo": {
            "cost_basis_dkk": round(fifo_cost, 2),
            "gain_dkk": round(fifo_gain, 2),
            "tax": fifo_tax,
            "after_tax_proceeds_dkk": round(fifo_after_tax, 2),
            "lots_used": fifo_lots_used,
        },
        "average_cost": {
            "cost_basis_dkk": round(avg_cost_basis, 2),
            "avg_price_per_share_dkk": round(avg_cost_per_share_dkk, 2),
            "gain_dkk": round(avg_gain, 2),
            "tax": avg_tax,
            "after_tax_proceeds_dkk": round(avg_after_tax, 2),
        },
        "recommendation": {
            "better_method": better_method,
            "savings_dkk": round(savings, 2),
            "explanation": f"{better_method} saves you {savings:,.0f} DKK in tax on this sale. "
                           f"{'FIFO uses your oldest (cheapest) shares first, creating a larger gain but may keep you in the lower tax bracket.' if better_method == 'Average Cost' else 'FIFO uses oldest shares which may have a higher cost basis from an earlier purchase, reducing the taxable gain.'}",
        },
        "note": "Denmark uses gennemsnitsmetoden (average cost) as default. You cannot freely switch between methods.",
    }


@router.post("/dividend-tax")
def analyze_dividend_tax(req: DividendInput):
    """Analyze US dividend withholding and Danish tax treatment."""
    gross_dkk = req.gross_dividend_usd * req.dkk_rate

    if req.w8ben_filed:
        us_withholding_rate = US_TREATY_WITHHOLDING
        withholding_note = "W-8BEN filed → 15% US treaty rate applies"
    else:
        us_withholding_rate = US_DEFAULT_WITHHOLDING
        withholding_note = "No W-8BEN → 30% US default rate. File W-8BEN to reduce to 15%!"

    us_tax_usd = req.gross_dividend_usd * us_withholding_rate
    us_tax_dkk = us_tax_usd * req.dkk_rate
    net_received_usd = req.gross_dividend_usd - us_tax_usd
    net_received_dkk = net_received_usd * req.dkk_rate

    # Danish tax on dividend
    if req.account_type == "ask":
        dk_tax_rate = ASK_TAX_RATE
        dk_tax_dkk = gross_dkk * dk_tax_rate
        # US withholding is creditable against ASK tax
        credit = min(us_tax_dkk, dk_tax_dkk)
        dk_tax_after_credit = dk_tax_dkk - credit
        total_tax = us_tax_dkk + dk_tax_after_credit
    else:
        # Free account: dividend is aktieindkomst
        dk_tax_rate = AKTIEINDKOMST_LOW_RATE  # Simplified — depends on total
        dk_tax_dkk = gross_dkk * dk_tax_rate
        credit = min(us_tax_dkk, dk_tax_dkk)
        dk_tax_after_credit = dk_tax_dkk - credit
        total_tax = us_tax_dkk + dk_tax_after_credit

    effective_rate = total_tax / gross_dkk if gross_dkk > 0 else 0

    # Reclaim info
    overpaid = 0
    reclaim_note = ""
    if not req.w8ben_filed:
        overpaid = (US_DEFAULT_WITHHOLDING - US_TREATY_WITHHOLDING) * req.gross_dividend_usd * req.dkk_rate
        reclaim_note = f"You overpaid {overpaid:,.0f} DKK in US withholding. File W-8BEN with your broker and apply for refund via IRS Form 1040-NR or your broker's reclaim process."

    return {
        "symbol": req.symbol,
        "gross_dividend_usd": req.gross_dividend_usd,
        "gross_dividend_dkk": round(gross_dkk, 2),
        "us_withholding": {"rate": us_withholding_rate, "amount_usd": round(us_tax_usd, 2), "amount_dkk": round(us_tax_dkk, 2), "note": withholding_note},
        "danish_tax": {"rate": dk_tax_rate, "gross_tax_dkk": round(dk_tax_dkk, 2), "credit_for_us_tax_dkk": round(credit, 2), "net_dk_tax_dkk": round(dk_tax_after_credit, 2)},
        "total_tax_dkk": round(total_tax, 2),
        "effective_rate": round(effective_rate * 100, 1),
        "net_after_all_tax_dkk": round(gross_dkk - total_tax, 2),
        "overpaid_dkk": round(overpaid, 2),
        "reclaim_note": reclaim_note,
        "account_type": req.account_type,
    }


@router.post("/year-end-checklist")
def year_end_checklist(req: YearEndRequest):
    """Generate year-end tax optimization actions before Dec 31."""
    actions = []
    threshold = AKTIEINDKOMST_THRESHOLD_MARRIED if req.marital_status == "married" else AKTIEINDKOMST_THRESHOLD_SINGLE

    net_gains = req.ytd_realized_gains_dkk - req.ytd_realized_losses_dkk

    # 1. Loss harvesting opportunity
    if req.unrealized_losses_dkk > 0 and net_gains > 0:
        offset_potential = min(req.unrealized_losses_dkk, net_gains)
        tax_saved = offset_potential * (AKTIEINDKOMST_HIGH_RATE if net_gains > threshold else AKTIEINDKOMST_LOW_RATE)
        actions.append({
            "priority": "high",
            "action": f"Consider selling losing positions to harvest {req.unrealized_losses_dkk:,.0f} DKK in losses",
            "reasoning": f"You have {net_gains:,.0f} DKK in realized gains. Harvesting {offset_potential:,.0f} DKK in losses would save ~{tax_saved:,.0f} DKK in tax.",
            "deadline": "December 31",
            "note": "You can rebuy the same stock after 30 days without triggering wash sale (Denmark has no formal wash sale rule, but SKAT may challenge immediate repurchase).",
        })

    # 2. Threshold management
    if net_gains > 0 and net_gains < threshold and req.unrealized_gains_dkk > 0:
        room = threshold - net_gains
        actions.append({
            "priority": "medium",
            "action": f"You have {room:,.0f} DKK of gains space left at 27% rate",
            "reasoning": f"Gains above {threshold:,.0f} DKK are taxed at 42%. Consider realizing some winners now while still in the 27% bracket. This is called 'gain harvesting'.",
            "deadline": "December 31",
            "note": "Only valuable if you plan to sell eventually anyway — don't sell just for tax reasons.",
        })

    # 3. US withholding reclaim
    if req.us_withholding_paid_dkk > 0:
        actions.append({
            "priority": "medium",
            "action": f"Ensure you claim {req.us_withholding_paid_dkk:,.0f} DKK in US withholding tax credit",
            "reasoning": "US withholding on dividends is creditable against Danish tax. Report on your Danish tax return (årsopgørelse) in rubrik 66.",
            "deadline": "Tax filing deadline (May 1 next year)",
            "note": "If you paid 30% instead of 15%, file for refund of the difference via your broker or IRS Form 1040-NR.",
        })

    # 4. ASK specific
    if req.account_type == "ask":
        ask_gain = req.ask_value_now_dkk - req.ask_value_start_of_year_dkk
        ask_tax = max(0, ask_gain) * ASK_TAX_RATE
        actions.append({
            "priority": "info",
            "action": f"ASK tax for this year: ~{ask_tax:,.0f} DKK (17% of {max(0,ask_gain):,.0f} DKK gain)",
            "reasoning": "ASK uses lagerbeskatning — you pay 17% on unrealized gains yearly. This is automatic. Ensure you have cash available in January to pay.",
            "deadline": "Automatic (assessed in spring)",
            "note": f"ASK contribution limit: {ASK_CONTRIBUTION_LIMIT:,} DKK total. Losses in ASK can only offset future ASK gains.",
        })

    # 5. Contribution limit check
    if req.account_type == "ask":
        actions.append({
            "priority": "info",
            "action": f"Check if you can contribute more to ASK (limit: {ASK_CONTRIBUTION_LIMIT:,} DKK)",
            "reasoning": "ASK's 17% flat rate is lower than aktieindkomst 27-42%. Maximize ASK before investing in free account.",
            "deadline": "Anytime",
            "note": "ASK cannot hold some securities (bonds, some ETFs). Check eligibility.",
        })

    # 6. W-8BEN renewal
    actions.append({
        "priority": "low",
        "action": "Verify your W-8BEN form is current (valid 3 years)",
        "reasoning": "Without valid W-8BEN, US dividends are taxed at 30% instead of 15%. Check with your broker.",
        "deadline": "Before it expires",
        "note": "Most Danish brokers (Saxo, Nordnet) handle this digitally.",
    })

    return {
        "year": datetime.now().year,
        "account_type": req.account_type,
        "marital_status": req.marital_status,
        "summary": {
            "ytd_gains_dkk": req.ytd_realized_gains_dkk,
            "ytd_losses_dkk": req.ytd_realized_losses_dkk,
            "net_taxable_dkk": max(0, net_gains),
            "threshold_dkk": threshold,
            "room_in_low_bracket_dkk": max(0, threshold - net_gains),
            "unrealized_losses_available_dkk": req.unrealized_losses_dkk,
        },
        "actions": actions,
        "disclaimer": "This is educational guidance, not tax advice. Danish tax law is complex. Consult a registered tax advisor (revisor) for your specific situation.",
    }
