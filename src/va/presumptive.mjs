// Presumptive service connection, from 38 CFR 3.307, 3.309 and 3.320, read on
// eCFR on 2026-11-14. A presumption removes the hardest part of a claim: the
// veteran does not have to prove the condition came from service, only that
// the service and the diagnosis fit the rule.
//
// The condition names are the regulation's own. Nothing is added from memory.
// The list is partial and says so: see NOT_COVERED.

const url = (section) => `https://www.ecfr.gov/current/title-38/part-3/section-${section}`;

export const PRESUMPTIVE = [
  {
    id: 'particulate',
    label: 'Burn pits and fine particulate matter',
    service: 'Service in the Southwest Asia theater of operations during the Persian Gulf War, or in Afghanistan, Syria, Djibouti or Uzbekistan on or after September 19, 2001.',
    rule: 'Exposure is presumed from the service itself. The conditions are service connected if they show up to any degree, at any time after separation.',
    cite: '38 CFR 3.320(a)',
    url: url('3.320'),
    groups: [
      { name: 'Chronic diseases', conditions: ['Asthma', 'Rhinitis', 'Sinusitis, to include rhinosinusitis'] },
      {
        name: 'Rare cancers',
        conditions: ['Squamous cell carcinoma of the larynx', 'Squamous cell carcinoma of the trachea', 'Adenocarcinoma of the trachea', 'Salivary gland-type tumors of the trachea', 'Adenosquamous carcinoma of the lung', 'Large cell carcinoma of the lung', 'Salivary gland-type tumors of the lung', 'Sarcomatoid carcinoma of the lung', 'Typical and atypical carcinoid of the lung'],
      },
    ],
  },
  {
    id: 'chronic',
    label: 'Chronic diseases that appear soon after service',
    service: 'At least 90 days of active, continuous service during a war period or after December 31, 1946.',
    rule: 'The disease must show up to a degree of 10 percent or more within 1 year of separation. The window is 3 years for Hansen\'s disease and tuberculosis, and 7 years for multiple sclerosis.',
    cite: '38 CFR 3.309(a)',
    url: url('3.309'),
    also: { cite: '38 CFR 3.307(a)', url: url('3.307') },
    groups: [
      {
        name: 'Listed chronic diseases',
        conditions: ['Anemia, primary', 'Arteriosclerosis', 'Arthritis', 'Atrophy, progressive muscular', 'Brain hemorrhage', 'Brain thrombosis', 'Bronchiectasis', 'Calculi of the kidney, bladder, or gallbladder', 'Cardiovascular-renal disease, including hypertension', 'Cirrhosis of the liver', 'Coccidioidomycosis', 'Diabetes mellitus', 'Encephalitis lethargica residuals', 'Endocarditis', 'Endocrinopathies', 'Epilepsies', 'Hansen\'s disease', 'Hodgkin\'s disease', 'Leukemia', 'Lupus erythematosus, systemic', 'Myasthenia gravis', 'Myelitis', 'Myocarditis', 'Nephritis', 'Other organic diseases of the nervous system', 'Osteitis deformans (Paget\'s disease)', 'Osteomalacia', 'Palsy, bulbar', 'Paralysis agitans', 'Psychoses', 'Purpura idiopathic, hemorrhagic', 'Raynaud\'s disease', 'Sarcoidosis', 'Scleroderma', 'Sclerosis, amyotrophic lateral', 'Sclerosis, multiple', 'Syringomyelia', 'Thromboangiitis obliterans (Buerger\'s disease)', 'Tuberculosis, active', 'Tumors, malignant, or of the brain or spinal cord or peripheral nerves', 'Ulcers, peptic (gastric or duodenal)'],
      },
    ],
  },
  {
    id: 'herbicide',
    label: 'Herbicide exposure, including Agent Orange',
    service: 'Exposure to an herbicide agent during service, as defined in 38 CFR 3.307(a)(6).',
    rule: 'The listed diseases are service connected even though there is no record of the disease during service.',
    cite: '38 CFR 3.309(e)',
    url: url('3.309'),
    groups: [
      {
        name: 'Listed diseases',
        conditions: ['AL amyloidosis', 'Chloracne or other acneform disease consistent with chloracne', 'Type 2 diabetes', 'Hodgkin\'s disease', 'Ischemic heart disease', 'All chronic B-cell leukemias', 'Multiple myeloma', 'Non-Hodgkin\'s lymphoma', 'Parkinson\'s disease', 'Early-onset peripheral neuropathy', 'Porphyria cutanea tarda', 'Prostate cancer', 'Respiratory cancers (lung, bronchus, larynx, or trachea)', 'Soft-tissue sarcoma (other than osteosarcoma, chondrosarcoma, Kaposi\'s sarcoma, or mesothelioma)'],
      },
    ],
  },
  {
    id: 'lejeune',
    label: 'Camp Lejeune water contamination',
    service: 'Exposure to contaminants in the water supply at Camp Lejeune during service, meeting 38 CFR 3.307(a)(7). Covers veterans, former reservists and National Guard members.',
    rule: 'The listed diseases are service connected even though there is no record of the disease during service.',
    cite: '38 CFR 3.309(f)',
    url: url('3.309'),
    groups: [{ name: 'Listed diseases', conditions: ['Kidney cancer', 'Liver cancer', 'Non-Hodgkin\'s lymphoma', 'Adult leukemia', 'Multiple myeloma', 'Parkinson\'s disease', 'Aplastic anemia and other myelodysplastic syndromes', 'Bladder cancer'] }],
  },
];

/** What is deliberately not here, so the lookup is not read as complete. */
export const NOT_COVERED = [
  'Conditions Congress has added by statute, including under the PACT Act, that the regulation text may not list yet',
  'Tropical diseases, former prisoner of war conditions and radiation exposure (38 CFR 3.309(b), (c) and (d))',
  'Gulf War undiagnosed illnesses (38 CFR 3.317)',
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Finds listed conditions matching what somebody typed. A match means the
 * name is on a list. It says nothing about whether their service fits the
 * rule or whether the VA will accept the diagnosis.
 */
export function findCondition(query) {
  const q = norm(query);
  if (q.length < 3) return [];
  const words = q.split(' ').filter((w) => w.length >= 3);
  const out = [];
  for (const p of PRESUMPTIVE) {
    for (const g of p.groups) {
      for (const c of g.conditions) {
        const name = norm(c);
        if (name.includes(q) || words.every((w) => name.includes(w))) out.push({ condition: c, group: g.name, id: p.id, label: p.label, service: p.service, rule: p.rule, cite: p.cite, url: p.url });
      }
    }
  }
  return out;
}
