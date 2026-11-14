// Passages from Title 38 of the Code of Federal Regulations, each read from
// the eCFR and quoted as written. Federal regulations are United States
// government works, so the text is reproduced in full rather than paraphrased:
// on this subject a paraphrase is where errors get in.
//
// This is the only material the answer agent is allowed to use. Nothing here
// is written from memory. To add a passage, read it on eCFR and copy it,
// including the citation and the URL.
//
// Last read from eCFR: 2026-11-14.

const url = (part, section) => `https://www.ecfr.gov/current/title-38/part-${part}/section-${section}`;

export const CORPUS = [
  {
    id: '3.303a',
    cite: '38 CFR 3.303(a)',
    url: url(3, '3.303'),
    topic: 'What service connection means',
    text: 'Service connection connotes many factors but basically it means that the facts, shown by evidence, establish that a particular injury or disease resulting in disability was incurred coincident with service in the Armed Forces, or if preexisting such service, was aggravated therein. This may be accomplished by affirmatively showing inception or aggravation during service or through the application of statutory presumptions. Each disabling condition shown by a veteran\'s service records, or for which he seeks a service connection must be considered on the basis of the places, types and circumstances of his service as shown by service records, the official history of each organization in which he served, his medical records and all pertinent medical and lay evidence. Determinations as to service connection will be based on review of the entire evidence of record, with due consideration to the policy of the Department of Veterans Affairs to administer the law under a broad and liberal interpretation consistent with the facts in each individual case.',
  },
  {
    id: '3.303b',
    cite: '38 CFR 3.303(b)',
    url: url(3, '3.303'),
    topic: 'Chronic conditions and continuity of symptoms',
    text: 'With chronic disease shown as such in service (or within the presumptive period under § 3.307) so as to permit a finding of service connection, subsequent manifestations of the same chronic disease at any later date, however remote, are service connected, unless clearly attributable to intercurrent causes. ... Continuity of symptomatology is required only where the condition noted during service (or in the presumptive period) is not, in fact, shown to be chronic or where the diagnosis of chronicity may be legitimately questioned. When the fact of chronicity in service is not adequately supported, then a showing of continuity after discharge is required to support the claim.',
  },
  {
    id: '3.303d',
    cite: '38 CFR 3.303(d)',
    url: url(3, '3.303'),
    topic: 'A condition first diagnosed after discharge',
    text: 'Postservice initial diagnosis of disease. Service connection may be granted for any disease diagnosed after discharge, when all the evidence, including that pertinent to service, establishes that the disease was incurred in service. Presumptive periods are not intended to limit service connection to diseases so diagnosed when the evidence warrants direct service connection. The presumptive provisions of the statute and Department of Veterans Affairs regulations implementing them are intended as liberalizations applicable when the evidence would not warrant service connection without their aid.',
  },
  {
    id: '3.304d',
    cite: '38 CFR 3.304(d)',
    url: url(3, '3.304'),
    topic: 'Combat injuries and lay evidence',
    text: 'Combat. Satisfactory lay or other evidence that an injury or disease was incurred or aggravated in combat will be accepted as sufficient proof of service connection if the evidence is consistent with the circumstances, conditions or hardships of such service even though there is no official record of such incurrence or aggravation. (Authority: 38 U.S.C. 1154(b))',
  },
  {
    id: '3.304e',
    cite: '38 CFR 3.304(e)',
    url: url(3, '3.304'),
    topic: 'Former prisoners of war',
    text: 'Prisoners of war. Where disability compensation is claimed by a former prisoner of war, omission of history or findings from clinical records made upon repatriation is not determinative of service connection, particularly if evidence of comrades in support of the incurrence of the disability during confinement is available.',
  },
  {
    id: '3.304f',
    cite: '38 CFR 3.304(f)',
    url: url(3, '3.304'),
    topic: 'PTSD claims',
    text: 'Posttraumatic stress disorder. Service connection for posttraumatic stress disorder requires medical evidence diagnosing the condition in accordance with § 4.125(a) of this chapter; a link, established by medical evidence, between current symptoms and an in-service stressor; and credible supporting evidence that the claimed in-service stressor occurred. ... (1) If the evidence establishes a diagnosis of posttraumatic stress disorder during service and the claimed stressor is related to that service, in the absence of clear and convincing evidence to the contrary, and provided that the claimed stressor is consistent with the circumstances, conditions, or hardships of the veteran\'s service, the veteran\'s lay testimony alone may establish the occurrence of the claimed in-service stressor.',
  },
  {
    id: '3.155b',
    cite: '38 CFR 3.155(b)',
    url: url(3, '3.155'),
    topic: 'Intent to file, and protecting the effective date',
    text: 'Intent to file a claim. A claimant ... may indicate a claimant\'s desire to file a claim for benefits by submitting an intent to file a claim to VA. An intent to file a claim must provide sufficient identifiable or biographical information to identify the claimant. Upon receipt of the intent to file a claim, VA will furnish the claimant with the appropriate application form prescribed by the Secretary. If VA receives a complete application form prescribed by the Secretary, as defined in paragraph (a) of § 3.160, appropriate to the benefit sought within 1 year of receipt of the intent to file a claim, VA will consider the complete claim filed as of the date the intent to file a claim was received.',
  },
  {
    id: '3.155b1',
    cite: '38 CFR 3.155(b)(1)',
    url: url(3, '3.155'),
    topic: 'The three ways to file an intent to file',
    text: 'An intent to file a claim can be submitted in one of the following three ways: (i) Saved electronic application. When an application otherwise meeting the requirements of this paragraph (b) is electronically initiated and saved in a claims-submission tool within a VA web-based electronic claims application system prior to filing of a complete claim, VA will consider that application to be an intent to file a claim. (ii) Written intent on prescribed intent to file a claim form. The submission to an agency of original jurisdiction of a signed and dated intent to file a claim, on the form prescribed by the Secretary for that purpose, will be accepted as an intent to file a claim. (iii) Oral intent communicated to designated VA personnel and recorded in writing. An oral statement of intent to file a claim will be accepted if it is directed to a VA employee designated to receive such a communication ... and the VA employee documents the date VA received the claimant\'s intent to file a claim in the claimant\'s records.',
  },
  {
    id: '3.155b2',
    cite: '38 CFR 3.155(b)(2)',
    url: url(3, '3.155'),
    topic: 'An intent to file does not need to name the condition',
    text: 'An intent to file a claim must identify the general benefit (e.g., compensation, pension), but need not identify the specific benefit claimed or any medical condition(s) on which the claim is based.',
  },
  {
    id: '4.31',
    cite: '38 CFR 4.31',
    url: url(4, '4.31'),
    topic: 'Zero percent ratings',
    text: 'In every instance where the schedule does not provide a zero percent evaluation for a diagnostic code, a zero percent evaluation shall be assigned when the requirements for a compensable evaluation are not met.',
  },
  {
    id: '4.25a',
    cite: '38 CFR 4.25(a)',
    url: url(4, '4.25'),
    topic: 'How ratings combine',
    text: 'To use table I, the disabilities will first be arranged in the exact order of their severity, beginning with the greatest disability and then combined with use of table I ... This combined value will then be converted to the nearest number divisible by 10, and combined values ending in 5 will be adjusted upward. Thus, with a 50 percent disability and a 30 percent disability, the combined value will be found to be 65 percent, but the 65 percent must be converted to 70 percent to represent the final degree of disability.',
  },
  {
    id: '4.26',
    cite: '38 CFR 4.26',
    url: url(4, '4.26'),
    topic: 'The bilateral factor for paired limbs',
    text: 'When a partial disability results from disease or injury of both arms, or of both legs, or of paired skeletal muscles, the ratings for the disabilities of the right and left sides will be combined as usual, and 10 percent of this value will be added (i.e., not combined) before proceeding with further combinations, or converting to degree of disability. ... (c) Applicability. The bilateral factor is not applicable unless there is partial disability of compensable degree in each of 2 paired extremities, or paired skeletal muscles.',
  },
  {
    id: '4.16a',
    cite: '38 CFR 4.16(a)',
    url: url(4, '4.16'),
    topic: 'Being paid at 100 percent without a 100 percent rating',
    text: 'Total disability ratings for compensation may be assigned, where the schedular rating is less than total, when the disabled person is, in the judgment of the rating agency, unable to secure or follow a substantially gainful occupation as a result of service-connected disabilities: Provided That, if there is only one such disability, this disability shall be ratable at 60 percent or more, and that, if there are two or more disabilities, there shall be at least one disability ratable at 40 percent or more, and sufficient additional disability to bring the combined rating to 70 percent or more.',
  },
  {
    id: '3.4b2',
    cite: '38 CFR 3.4(b)(2)',
    url: url(3, '3.4'),
    topic: 'Adding dependents to compensation',
    text: 'An additional amount of compensation may be payable for a spouse, child, and/or dependent parent where a veteran is entitled to compensation based on disability evaluated as 30 per centum or more disabling. (Authority: 38 U.S.C. 1115)',
  },
  {
    id: '17.36b',
    cite: '38 CFR 17.36(b)',
    url: url(17, '17.36'),
    topic: 'VA health care enrollment priority groups',
    text: 'The Secretary will determine which categories of veterans are eligible to be enrolled based on the following order of priority: (1) Veterans with a singular or combined rating of 50 percent or greater based on one or more service-connected disabilities or unemployability; and veterans awarded the Medal of Honor. (2) Veterans with a singular or combined rating of 30 percent or 40 percent based on one or more service-connected disabilities. (3) Veterans who are former prisoners of war; veterans awarded the Purple Heart; veterans with a singular or combined rating of 10 percent or 20 percent based on one or more service-connected disabilities ...',
  },
  {
    id: '17.271a1',
    cite: '38 CFR 17.271(a)(1)',
    url: url(17, '17.271'),
    topic: 'CHAMPVA for a spouse or child',
    text: 'The following persons are eligible for CHAMPVA benefits provided that they are not eligible under Title 10 for the TRICARE Program or Part A of Title XVIII of the Social Security Act (Medicare) ... (1) The spouse or child of a veteran who has been adjudicated by VA as having a permanent and total service-connected disability.',
  },
  {
    id: '21.3021a',
    cite: '38 CFR 21.3021(a)',
    url: url(21, '21.3021'),
    topic: 'Chapter 35 education benefits for a spouse or child',
    text: 'Eligible person means: (1) A child of a ... (iii) Veteran, serviceman or servicewoman who has a total disability permanent in nature resulting from a service-connected disability. ... (3) The spouse of a: (i) Veteran, serviceman or servicewoman who has a total disability permanent in nature resulting from a service-connected disability.',
  },
];

/** Where to actually go. These are the VA's own pages, checked 2026-11-14. */
export const LINKS = [
  { id: 'rep', label: 'Find a VA accredited representative or VSO', url: 'https://www.va.gov/get-help-from-accredited-representative/', note: 'Free, trained, and able to act on your behalf. The usual first stop before filing.' },
  { id: 'file', label: 'File a disability compensation claim', url: 'https://www.va.gov/disability/how-to-file-claim/', note: 'The VA\'s own instructions for filing.' },
  { id: 'itf', label: 'Start an intent to file', url: 'https://www.va.gov/disability/how-to-file-claim/', note: 'An intent to file sets the date your claim counts from, under 38 CFR 3.155(b).' },
  { id: 'records', label: 'Request your military records', url: 'https://www.archives.gov/veterans/military-service-records', note: 'Service treatment records and personnel records, from the National Archives.' },
  { id: 'presumptive', label: 'Check the presumptive conditions', url: 'https://www.va.gov/disability/eligibility/hazardous-materials-exposure/', note: 'Some exposures and conditions are presumed service connected, which removes the need to prove the link.' },
];
