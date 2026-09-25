/**
 * Plans and what each one unlocks. The features travel inside the signed license,
 * so changing a plan here takes effect on the next validation — no app update.
 * Add a plan or a feature by editing this file only.
 */
const BASIC = ['attendance', 'employees', 'schedules', 'incidencias', 'corrections']
const PRO = [...BASIC, 'reports', 'export', 'face', 'audit']
const ENTERPRISE = [...PRO, 'multi_device', 'multi_branch']

export const PLANS = {
  basico: { label: 'Básico', defaultDevices: 1, features: BASIC },
  profesional: { label: 'Profesional', defaultDevices: 1, features: PRO },
  empresa: { label: 'Empresa', defaultDevices: 3, features: ENTERPRISE },
}

export const isPlan = (key) => Object.hasOwn(PLANS, key)
export const featuresOf = (plan) => (isPlan(plan) ? PLANS[plan].features : BASIC)
