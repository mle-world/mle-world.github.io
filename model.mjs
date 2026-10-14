export function validQuantile(value) { return Number.isInteger(value) && value >= 1 && value <= 5; }
export function policyTrials(trials, policy, setting, task = 'all', seed = null) {
  return trials.filter(t => t.policy === policy && t.setting === (policy === 'base' ? 'reference' : setting)
    && (task === 'all' || t.task === task) && (seed === null || t.seed === Number(seed)));
}
export function mean(values) { return values.length ? values.reduce((a,b) => a+b, 0) / values.length : null; }
