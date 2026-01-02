// apps/realtime-api/src/engine/cooldown.ts

import { InsightCategory } from './rules';

interface CooldownEntry {
  category: InsightCategory;
  lastTriggeredAt: number;
}

interface GlobalCooldown {
  lastInsightAt: number;
}

export class CooldownManager {
  private cooldowns = new Map<string, CooldownEntry[]>();
  private globalCooldowns = new Map<string, GlobalCooldown>();
  private readonly GLOBAL_COOLDOWN_MS = 25_000; // 25s entre qualquer insight (reduzido de 40s)

  /**
   * Verifica cooldown GLOBAL (entre qualquer tipo de insight)
   */
  canTriggerGlobal(callId: string): boolean {
    const global = this.globalCooldowns.get(callId);
    if (!global) {
      return true; // Primeiro insight
    }

    const elapsed = Date.now() - global.lastInsightAt;
    return elapsed >= this.GLOBAL_COOLDOWN_MS;
  }

  /**
   * Verifica se pode disparar insight para esta call + categoria
   */
  canTrigger(callId: string, category: InsightCategory, cooldownMs: number): boolean {
    // Primeiro verifica cooldown global
    if (!this.canTriggerGlobal(callId)) {
      return false;
    }

    // Depois verifica cooldown por categoria
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

    // Atualizar cooldown da categoria
    const existing = entries.find(e => e.category === category);
    if (existing) {
      existing.lastTriggeredAt = now;
    } else {
      entries.push({ category, lastTriggeredAt: now });
    }

    this.cooldowns.set(callId, entries);

    // Atualizar cooldown global
    this.globalCooldowns.set(callId, { lastInsightAt: now });
  }

  /**
   * Retorna tempo desde último insight (qualquer tipo)
   */
  getTimeSinceLastInsight(callId: string): number {
    const global = this.globalCooldowns.get(callId);
    if (!global) {
      return Infinity; // Nunca teve insight
    }
    return Date.now() - global.lastInsightAt;
  }

  /**
   * Limpar cooldowns de uma call (quando encerrar)
   */
  clear(callId: string): void {
    this.cooldowns.delete(callId);
    this.globalCooldowns.delete(callId);
  }
}
