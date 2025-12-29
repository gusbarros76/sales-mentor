// apps/realtime-api/src/engine/cooldown.ts

import { InsightCategory } from './rules';

interface CooldownEntry {
  category: InsightCategory;
  lastTriggeredAt: number;
}

export class CooldownManager {
  private cooldowns = new Map<string, CooldownEntry[]>();

  /**
   * Verifica se pode disparar insight para esta call + categoria
   */
  canTrigger(callId: string, category: InsightCategory, cooldownMs: number): boolean {
    const entries = this.cooldowns.get(callId) || [];
    const now = Date.now();

    const lastEntry = entries.find(e => e.category === category);

    if (!lastEntry) {
      return true; // Primeira vez desta categoria
    }

    const elapsed = now - lastEntry.lastTriggeredAt;
    return elapsed >= cooldownMs;
  }

  /**
   * Registra que um insight foi disparado
   */
  markTriggered(callId: string, category: InsightCategory): void {
    const entries = this.cooldowns.get(callId) || [];
    const now = Date.now();

    // Atualizar ou adicionar
    const existing = entries.find(e => e.category === category);
    if (existing) {
      existing.lastTriggeredAt = now;
    } else {
      entries.push({ category, lastTriggeredAt: now });
    }

    this.cooldowns.set(callId, entries);
  }

  /**
   * Limpar cooldowns de uma call (quando encerrar)
   */
  clear(callId: string): void {
    this.cooldowns.delete(callId);
  }
}
