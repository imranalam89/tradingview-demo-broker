import pandas as pd
import numpy as np
import json
import os

def load_data(filepath):
    df = pd.read_csv(filepath)
    df['Datetime'] = pd.to_datetime(df['Date'] + ' ' + df['Time'])
    df = df.sort_values('Datetime').reset_index(drop=True)
    return df

def calculate_ema(series, period):
    return series.ewm(span=period, adjust=False).mean()

def calculate_atr(df, period=14):
    high_low = df['High'] - df['Low']
    high_close = (df['High'] - df['Close'].shift()).abs()
    low_close = (df['Low'] - df['Close'].shift()).abs()
    ranges = pd.concat([high_low, high_close, low_close], axis=1)
    true_range = ranges.max(axis=1)
    return true_range.rolling(period).mean()

def calculate_rsi(series, period=14):
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss + 1e-9)
    return 100 - (100 / (1 + rs))

def backtest_gold_strategy(
    df,
    initial_capital=10000.0,
    risk_pct=0.01,
    fast_ema=20,
    slow_ema=50,
    trend_ema=200,
    atr_mult_sl=1.5,
    rr_ratio=2.0,
    use_trailing_stop=True
):
    df = df.copy()
    df['EMA_Fast'] = calculate_ema(df['Close'], fast_ema)
    df['EMA_Slow'] = calculate_ema(df['Close'], slow_ema)
    df['EMA_Trend'] = calculate_ema(df['Close'], trend_ema)
    df['ATR'] = calculate_atr(df, 14)
    df['RSI'] = calculate_rsi(df['Close'], 14)
    
    capital = initial_capital
    peak_capital = initial_capital
    max_drawdown_usd = 0.0
    max_drawdown_pct = 0.0
    
    trades = []
    in_position = False
    pos_type = None
    entry_price = 0.0
    entry_time = None
    entry_index = 0
    sl_price = 0.0
    tp_price = 0.0
    position_size = 0.0
    risk_amount = 0.0

    for i in range(trend_ema + 1, len(df)):
        current_candle = df.iloc[i]
        prev_candle = df.iloc[i-1]
        
        # Check exits if in position
        if in_position:
            high = current_candle['High']
            low = current_candle['Low']
            close = current_candle['Close']
            
            # Trailing stop update
            if use_trailing_stop:
                if pos_type == 'LONG' and high > entry_price + (entry_price - sl_price):
                    # Move SL to breakeven + buffer
                    sl_price = max(sl_price, entry_price + 1.0)
                elif pos_type == 'SHORT' and low < entry_price - (sl_price - entry_price):
                    sl_price = min(sl_price, entry_price - 1.0)

            trade_exit = False
            exit_price = 0.0
            exit_reason = ""

            if pos_type == 'LONG':
                if low <= sl_price:
                    exit_price = sl_price
                    exit_reason = "Stop Loss / Trailing SL"
                    trade_exit = True
                elif high >= tp_price:
                    exit_price = tp_price
                    exit_reason = "Take Profit Target"
                    trade_exit = True
            elif pos_type == 'SHORT':
                if high >= sl_price:
                    exit_price = sl_price
                    exit_reason = "Stop Loss / Trailing SL"
                    trade_exit = True
                elif low <= tp_price:
                    exit_price = tp_price
                    exit_reason = "Take Profit Target"
                    trade_exit = True

            if trade_exit:
                pnl = (exit_price - entry_price) * position_size if pos_type == 'LONG' else (entry_price - exit_price) * position_size
                capital += pnl
                pnl_pct = (pnl / (capital - pnl)) * 100
                
                if capital > peak_capital:
                    peak_capital = capital
                dd_usd = peak_capital - capital
                dd_pct = (dd_usd / peak_capital) * 100
                if dd_usd > max_drawdown_usd:
                    max_drawdown_usd = dd_usd
                if dd_pct > max_drawdown_pct:
                    max_drawdown_pct = dd_pct

                trades.append({
                    'Trade #': len(trades) + 1,
                    'Entry Date': str(entry_time),
                    'Exit Date': str(current_candle['Datetime']),
                    'Type': pos_type,
                    'Entry Price': round(entry_price, 2),
                    'Exit Price': round(exit_price, 2),
                    'SL Price': round(sl_price, 2),
                    'TP Price': round(tp_price, 2),
                    'Lot Size': round(position_size, 2),
                    'PnL ($)': round(pnl, 2),
                    'PnL (%)': round(pnl_pct, 2),
                    'Balance': round(capital, 2),
                    'Exit Reason': exit_reason,
                    'Result': 'WIN' if pnl > 5 else ('LOSS' if pnl < -5 else 'BREAKEVEN')
                })
                in_position = False
                continue

        # Check entries if not in position
        if not in_position:
            atr = current_candle['ATR']
            if pd.isna(atr) or atr <= 0:
                continue

            # Bullish Trend Alignment & Pullback Trigger
            is_uptrend = current_candle['Close'] > current_candle['EMA_Trend']
            is_downtrend = current_candle['Close'] < current_candle['EMA_Trend']
            
            # EMA Cross & RSI Filter
            long_trigger = (
                is_uptrend and 
                prev_candle['EMA_Fast'] <= prev_candle['EMA_Slow'] and 
                current_candle['EMA_Fast'] > current_candle['EMA_Slow'] and
                current_candle['RSI'] > 50 and current_candle['RSI'] < 70
            )
            
            short_trigger = (
                is_downtrend and 
                prev_candle['EMA_Fast'] >= prev_candle['EMA_Slow'] and 
                current_candle['EMA_Fast'] < current_candle['EMA_Slow'] and
                current_candle['RSI'] < 50 and current_candle['RSI'] > 30
            )

            if long_trigger:
                in_position = True
                pos_type = 'LONG'
                entry_price = current_candle['Close']
                entry_time = current_candle['Datetime']
                entry_index = i
                sl_distance = max(atr * atr_mult_sl, 5.0)
                sl_price = entry_price - sl_distance
                tp_price = entry_price + (sl_distance * rr_ratio)
                
                risk_amount = capital * risk_pct
                position_size = risk_amount / sl_distance
                
            elif short_trigger:
                in_position = True
                pos_type = 'SHORT'
                entry_price = current_candle['Close']
                entry_time = current_candle['Datetime']
                entry_index = i
                sl_distance = max(atr * atr_mult_sl, 5.0)
                sl_price = entry_price + sl_distance
                tp_price = entry_price - (sl_distance * rr_ratio)
                
                risk_amount = capital * risk_pct
                position_size = risk_amount / sl_distance

    # Summary Statistics
    trade_df = pd.DataFrame(trades)
    if len(trade_df) > 0:
        win_trades = trade_df[trade_df['PnL ($)'] > 5]
        loss_trades = trade_df[trade_df['PnL ($)'] < -5]
        be_trades = trade_df[(trade_df['PnL ($)'] >= -5) & (trade_df['PnL ($)'] <= 5)]
        
        gross_profit = win_trades['PnL ($)'].sum() if len(win_trades) > 0 else 0
        gross_loss = abs(loss_trades['PnL ($)'].sum()) if len(loss_trades) > 0 else 0
        profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else float('inf')
        win_rate = round((len(win_trades) / len(trade_df)) * 100, 2)
        
        summary = {
            "strategyName": "Apex Gold Pro Trend-Following & Dynamic Trailing Engine",
            "initialCapital": initial_capital,
            "finalBalance": round(capital, 2),
            "netProfitUSD": round(capital - initial_capital, 2),
            "returnPct": round(((capital - initial_capital) / initial_capital) * 100, 2),
            "totalTrades": len(trade_df),
            "winningTrades": len(win_trades),
            "losingTrades": len(loss_trades),
            "breakEvenTrades": len(be_trades),
            "winRatePct": win_rate,
            "profitFactor": profit_factor,
            "grossProfitUSD": round(gross_profit, 2),
            "grossLossUSD": round(gross_loss, 2),
            "maxDrawdownUSD": round(max_drawdown_usd, 2),
            "maxDrawdownPct": round(max_drawdown_pct, 2),
            "avgWinUSD": round(win_trades['PnL ($)'].mean(), 2) if len(win_trades) > 0 else 0,
            "avgLossUSD": round(abs(loss_trades['PnL ($)'].mean()), 2) if len(loss_trades) > 0 else 0,
            "riskRewardRatio": rr_ratio
        }
    else:
        summary = {"totalTrades": 0}

    return summary, trade_df

if __name__ == "__main__":
    filepath = "XAUUSD_1Hour_OHLC_12Months_2025_2026.csv"
    if os.path.exists(filepath):
        df = load_data(filepath)
        print(f"Loaded {len(df)} 1-Hour Gold Candles from {filepath}")
        summary, trades = backtest_gold_strategy(df, initial_capital=10000, risk_pct=0.02, rr_ratio=2.5)
        print("\n--- BACKTEST RESULTS SUMMARY ---")
        for k, v in summary.items():
            print(f"  {k}: {v}")
        
        trades.to_csv("Apex_Gold_1H_Trend_Engine_Trades.csv", index=False)
        with open("Apex_Gold_1H_Trend_Engine_Summary.json", "w") as f:
            json.dump(summary, f, indent=2)
        print("\nExported trade log to 'Apex_Gold_1H_Trend_Engine_Trades.csv' and summary JSON.")
