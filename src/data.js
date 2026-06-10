/* Evidence-based content store.
   Sources are summarized for an educational tool, not clinical use. Key references:
   - Gray's Anatomy / Kandel, Principles of Neural Science (6e) for structure–function.
   - Bethlehem et al., "Brain charts for the human lifespan", Nature 2022 (lifespan volume).
   - Ritchie et al., "Sex differences in the adult human brain", Cereb. Cortex 2018.
   - Braak & Braak staging (Alzheimer's); Dickson (Parkinson's); standard neurology texts. */

export const REGIONS = {
  frontal: {
    name: 'Frontal lobe',
    sub: 'Executive control · movement · speech production',
    color: 0x4f8cff,
    body: `The largest lobe and the last to fully mature (into the mid-20s). It runs the brain's "executive" functions — planning, decision-making, working memory, and impulse control — through the prefrontal cortex. The precentral gyrus at its rear edge is the primary motor cortex, which commands voluntary movement of the opposite side of the body.`,
    functions: ['Planning & decision-making', 'Voluntary movement (motor cortex)', 'Speech production (Broca’s area)', 'Working memory', 'Personality & impulse control'],
    facts: [['Maturity', 'Matures last (~25 yrs)'], ['Motor map', 'Precentral gyrus'], ['Language', 'Broca’s area (usually left)']],
    cite: 'Kandel, Principles of Neural Science 6e; Miller & Cohen 2001 (prefrontal control).',
  },
  parietal: {
    name: 'Parietal lobe',
    sub: 'Touch · spatial sense · navigation',
    color: 0x46d39a,
    body: `Sits behind the central sulcus and integrates the senses to build a model of the body in space. Its postcentral gyrus is the primary somatosensory cortex — the destination for touch, temperature, pain, and proprioception from the opposite side of the body. It also handles spatial attention and hand–eye coordination.`,
    functions: ['Touch & body sensation (somatosensory cortex)', 'Spatial awareness & attention', 'Hand–eye coordination', 'Number & word manipulation'],
    facts: [['Sensory map', 'Postcentral gyrus'], ['Damage', 'Neglect of opposite side']],
    cite: 'Kandel 6e; somatosensory homunculus (Penfield & Boldrey 1937).',
  },
  temporal: {
    name: 'Temporal lobe',
    sub: 'Hearing · memory · language understanding',
    color: 0xffa14a,
    body: `Found beneath the lateral (Sylvian) fissure. It contains the primary auditory cortex (Heschl's gyrus) and Wernicke's area for understanding language. Tucked inside its medial surface are the hippocampus and amygdala — central to forming new memories and processing emotion. This is the region first and worst hit by Alzheimer's disease.`,
    functions: ['Hearing (auditory cortex)', 'Language comprehension (Wernicke’s area)', 'Long-term memory formation (hippocampus)', 'Emotion & fear (amygdala)', 'Face & object recognition'],
    facts: [['Auditory map', 'Heschl’s gyrus'], ['Memory hub', 'Hippocampus (medial)'], ['Vulnerable to', 'Alzheimer’s, epilepsy']],
    cite: 'Squire & Wixted 2011 (memory); Kandel 6e.',
  },
  occipital: {
    name: 'Occipital lobe',
    sub: 'Vision',
    color: 0xb36bff,
    body: `The brain's visual processing center, at the very back of the head. Signals from the eyes arrive at the primary visual cortex (V1) around the calcarine sulcus, then fan out through specialized areas that decode motion, colour, depth, and form. Damage here can cause blindness even when the eyes work perfectly.`,
    functions: ['Primary vision (V1)', 'Motion detection (area MT/V5)', 'Colour processing (V4)', 'Depth & form perception'],
    facts: [['Entry point', 'V1 / calcarine sulcus'], ['Relay', 'Via thalamus (LGN)']],
    cite: 'Hubel & Wiesel (visual cortex); Kandel 6e.',
  },
  cerebellum: {
    name: 'Cerebellum',
    sub: 'Coordination · balance · timing',
    color: 0x2fd6c6,
    body: `The "little brain" at the back, below the occipital lobe. Though only ~10% of brain volume, it holds more than half the brain's neurons. It fine-tunes movement for smoothness, balance, and precise timing, and also contributes to attention and language. Damage causes clumsy, uncoordinated movement (ataxia) rather than paralysis.`,
    functions: ['Motor coordination & smoothing', 'Balance & posture', 'Motor learning', 'Timing & some cognition'],
    facts: [['Neuron count', '>50% of the whole brain'], ['Damage', 'Ataxia (incoordination)']],
    cite: 'Kandel 6e; Schmahmann (cerebellar cognition).',
  },
  brainstem: {
    name: 'Brainstem',
    sub: 'Life support · relays · arousal',
    color: 0xc8b08a,
    body: `Connects the brain to the spinal cord and runs the body's automatic life support: breathing, heart rate, blood pressure, swallowing, and sleep–wake arousal. Almost every signal traveling between brain and body passes through it, and most cranial nerves originate here. The midbrain section contains the substantia nigra, which degenerates in Parkinson's disease.`,
    functions: ['Breathing & heart rate', 'Sleep–wake & arousal', 'Swallowing & reflexes', 'Pathway between brain & body', 'Cranial nerve origins'],
    facts: [['Parts', 'Midbrain · pons · medulla'], ['Contains', 'Substantia nigra (midbrain)']],
    cite: 'Kandel 6e; standard neuroanatomy.',
  },
};

/* Deep (subcortical) structures — referenced by disease & senses modes. */
export const SUBCORTICAL = {
  thalamus:      { name: 'Thalamus',        sub: 'Grand Central relay of the senses' },
  hippocampus:   { name: 'Hippocampus',     sub: 'Forms new long-term memories' },
  amygdala:      { name: 'Amygdala',        sub: 'Fear & emotional salience' },
  basalGanglia:  { name: 'Basal ganglia',   sub: 'Initiates & gates movement' },
  substantiaNigra:{ name: 'Substantia nigra',sub: 'Dopamine source for movement' },
  ventricles:    { name: 'Ventricles',      sub: 'Cerebrospinal-fluid spaces' },
};

/* Lifespan narrative shown in the Lifespan panel; values are population averages. */
export const LIFESPAN = {
  stages: [
    { max: 1,  label: 'Newborn',  note: 'At birth the brain is ~25% of adult volume but already has nearly all its neurons. Rapid wiring begins.' },
    { max: 5,  label: 'Early childhood', note: 'Explosive synapse formation. By age 5 the brain is ~90% of adult volume. Peak synaptic density.' },
    { max: 12, label: 'Childhood', note: 'Synaptic pruning and myelination refine circuits. Grey matter peaks in late childhood.' },
    { max: 19, label: 'Adolescence', note: 'Prefrontal cortex still maturing — emotion outpaces impulse control. Heavy pruning of unused connections.' },
    { max: 40, label: 'Adult', note: 'Peak total brain volume (~early 20s), then very gradual change. White matter peaks around age 40.' },
    { max: 65, label: 'Midlife', note: 'Slow decline begins (~0.2–0.5%/yr). Frontal lobes and hippocampus thin first; sulci widen.' },
    { max: 200, label: 'Older adult', note: 'Atrophy accelerates: grey matter shrinks, ventricles enlarge. Healthy ageing ≠ dementia.' },
  ],
  sex: `On average, adult male brains are ~10–12% larger in raw volume than female brains — a difference that largely tracks body size. Distributions overlap heavily: brain size does not predict intelligence, and most regional differences are small once total size is accounted for. Some studies report proportionally more grey matter in certain female regions and more white matter / larger absolute subcortical volumes in males, but individual variation dwarfs the average sex difference.`,
  cite: 'Bethlehem et al., Nature 2022 (lifespan charts); Ritchie et al., Cereb Cortex 2018 (sex differences); Giedd et al. (developmental MRI).',
};

/* Diseases & injuries. Each entry drives the 3D highlight (affected lobes, deep
   structures, ventricle scale, markers, pulsing focus) and the detail panel. */
export const DISEASES = {
  alzheimers: {
    name: 'Alzheimer’s disease', sub: 'Neurodegeneration · memory', color: 0xff6b6b,
    body: `The most common cause of dementia. Abnormal amyloid plaques and tau tangles accumulate, killing neurons. Damage begins in the entorhinal cortex and hippocampus — the memory-forming hub — then spreads through the temporal and parietal association cortex and eventually most of the brain. As tissue is lost, the fluid-filled ventricles enlarge.`,
    symptoms: ['Short-term memory loss', 'Disorientation in time & place', 'Word-finding difficulty', 'Impaired judgement', 'Personality change (later)'],
    areas: ['Hippocampus & entorhinal cortex (earliest)', 'Temporal & parietal cortex', 'Widespread atrophy (late)', 'Enlarged ventricles'],
    affectedLobes: ['temporal', 'parietal', 'frontal'],
    deep: ['hippocampus'], ventricleScale: 1.8, ghost: true,
    cite: 'Braak & Braak 1991 (staging); Jack et al. 2013 (biomarker model).',
  },
  parkinsons: {
    name: 'Parkinson’s disease', sub: 'Movement · dopamine loss', color: 0xffb14a,
    body: `A movement disorder caused by the death of dopamine-producing neurons in the substantia nigra of the midbrain. Without dopamine, the basal ganglia can no longer smoothly start and stop movement. Clumps of the protein α-synuclein (Lewy bodies) are the hallmark. The substantia nigra visibly loses its dark pigment.`,
    symptoms: ['Resting tremor', 'Rigidity (stiffness)', 'Bradykinesia (slow movement)', 'Postural instability', 'Later: cognitive change'],
    areas: ['Substantia nigra (dopamine loss)', 'Basal ganglia circuit', 'Brainstem'],
    affectedLobes: [], deep: ['substantiaNigra', 'basalGanglia'], parkinsons: true, ghost: true,
    cite: 'Dickson, neuropathology of PD; Kandel 6e (basal ganglia).',
  },
  stroke: {
    name: 'Ischemic stroke', sub: 'Blocked blood flow', color: 0xff5d5d,
    body: `A clot blocks an artery, starving brain tissue of oxygen — neurons die within minutes. The lost functions depend on the territory affected. A common site is the middle cerebral artery, supplying the lateral frontal, parietal and temporal cortex. On the left (language-dominant) side this often causes right-body weakness plus aphasia. Remember F.A.S.T.: Face, Arms, Speech, Time.`,
    symptoms: ['Sudden one-sided weakness/numbness', 'Slurred speech or aphasia', 'Facial droop', 'Vision or balance loss', 'Time = brain: call emergency'],
    areas: ['Middle cerebral artery territory', 'Motor & sensory cortex', 'Language areas (if left)'],
    affectedLobes: ['frontal', 'parietal', 'temporal'],
    deep: [], ghost: false,
    markers: [{ pos: [-0.52, 0.06, 0.04], size: 0.16, color: 0x8b1a1a }],
    cite: 'AHA/ASA stroke guidelines; standard neurology.',
  },
  ms: {
    name: 'Multiple sclerosis', sub: 'Demyelination · autoimmune', color: 0x6bd0ff,
    body: `The immune system attacks myelin — the insulation around nerve fibres — leaving scars (plaques) scattered through the white matter, classically around the ventricles and in the optic nerve, brainstem and spinal cord. Disrupted conduction causes symptoms that come and go (relapsing–remitting) and accumulate over time.`,
    symptoms: ['Optic neuritis (vision loss/pain)', 'Numbness or tingling', 'Weakness & fatigue', 'Balance & coordination problems', 'Relapsing–remitting course'],
    areas: ['Periventricular white matter', 'Optic nerves', 'Brainstem & spinal cord'],
    affectedLobes: [], deep: ['ventricles'], ghost: true,
    markers: [
      { pos: [0.16, 0.18, 0.08], size: 0.05, color: 0xeaffff }, { pos: [-0.14, 0.2, -0.05], size: 0.045, color: 0xeaffff },
      { pos: [0.2, 0.06, -0.12], size: 0.05, color: 0xeaffff }, { pos: [-0.2, 0.1, 0.12], size: 0.04, color: 0xeaffff },
      { pos: [0.05, 0.24, -0.02], size: 0.045, color: 0xeaffff }, { pos: [-0.06, 0.0, -0.2], size: 0.05, color: 0xeaffff },
    ],
    cite: 'McDonald criteria; standard neurology.',
  },
  huntingtons: {
    name: 'Huntington’s disease', sub: 'Inherited · movement', color: 0xb36bff,
    body: `An inherited disorder caused by a CAG-repeat expansion in the HTT gene. It progressively destroys the striatum (caudate and putamen) of the basal ganglia, producing involuntary dance-like movements (chorea) alongside cognitive and psychiatric decline. Caudate loss enlarges the frontal horns of the ventricles.`,
    symptoms: ['Chorea (involuntary movements)', 'Cognitive decline', 'Mood & psychiatric changes', 'Difficulty with voluntary movement'],
    areas: ['Striatum: caudate & putamen', 'Basal ganglia', 'Cortex (later)'],
    affectedLobes: ['frontal'], deep: ['basalGanglia'], ventricleScale: 1.5, ghost: true,
    cite: 'HTT CAG-repeat (Huntington’s Disease Collaborative 1993); standard neurology.',
  },
  tbi: {
    name: 'Traumatic brain injury', sub: 'Impact · concussion', color: 0xffcf5b,
    body: `A blow or jolt to the head. Because the brain sits against bony ridges, the frontal and temporal poles are especially vulnerable, and the brain can be bruised on both the impact side and the opposite side (coup–contrecoup). Rapid acceleration can also shear long axons (diffuse axonal injury). A concussion is a mild TBI with temporary disruption of function.`,
    symptoms: ['Headache & confusion', 'Memory & concentration problems', 'Dizziness or nausea', 'Mood changes', 'Severe: focal deficits, loss of consciousness'],
    areas: ['Frontal poles', 'Temporal poles', 'Diffuse axonal injury (white matter)'],
    affectedLobes: ['frontal', 'temporal'], deep: [], ghost: false,
    markers: [{ pos: [0.0, 0.05, 0.74], size: 0.12, color: 0xffcf5b }],
    cite: 'CDC TBI; standard neurotrauma references.',
  },
  epilepsy: {
    name: 'Epilepsy (temporal)', sub: 'Excess electrical activity', color: 0x5ff0a8,
    body: `Seizures are bursts of abnormally synchronized electrical activity. The most common focal epilepsy in adults arises in the temporal lobe, often linked to scarring of the hippocampus (mesial temporal sclerosis). Activity can stay local (focal seizure) or spread across the brain (generalize).`,
    symptoms: ['Seizures (focal or generalized)', 'Auras (déjà-vu, smells)', 'Automatisms (lip-smacking)', 'Altered awareness', 'Memory difficulty'],
    areas: ['Temporal lobe (seizure focus)', 'Hippocampus', 'Spreading networks'],
    affectedLobes: ['temporal'], deep: ['hippocampus'], ghost: true,
    pulse: true,
    cite: 'ILAE classification; standard epileptology.',
  },
};

/* Sensory pathways: receptor → relay → cortical destination. Points are in
   brain-local normalized coords; the first point sits at the sense organ. */
export const SENSES = {
  vision: {
    name: 'Vision', sub: 'Eyes → V1 (occipital)', color: 0xb36bff, dest: 'occipital',
    relay: 'Lateral geniculate nucleus (thalamus)', destArea: 'Primary visual cortex (V1)',
    path: [[0.17, 0.05, 1.05], [0.10, -0.06, 0.55], [0.0, -0.16, 0.30], [0.10, -0.04, -0.05], [0.04, -0.06, -0.55], [0.0, -0.06, -0.72]],
    body: `Light focused on the retina is converted to nerve signals. The optic nerves from both eyes meet at the optic chiasm, where the nasal halves cross — so the left visual field is processed on the right and vice-versa. Signals relay through the thalamus (LGN) to the primary visual cortex at the back of the occipital lobe.`,
    cite: 'Hubel & Wiesel; Kandel 6e (visual system).',
  },
  hearing: {
    name: 'Hearing', sub: 'Ears → A1 (temporal)', color: 0xffa14a, dest: 'temporal',
    relay: 'Medial geniculate nucleus (thalamus)', destArea: 'Primary auditory cortex (Heschl’s gyrus)',
    path: [[0.80, -0.05, 0.06], [0.30, -0.34, 0.0], [0.08, -0.42, -0.02], [0.12, -0.03, -0.06], [0.45, -0.10, 0.0]],
    body: `The cochlea turns sound into nerve impulses. Signals climb through several brainstem stations (cochlear nuclei, superior olive, inferior colliculus) — which compare the two ears to localize sound — then relay through the thalamus (MGN) to the primary auditory cortex in the temporal lobe.`,
    cite: 'Kandel 6e (auditory system).',
  },
  touch: {
    name: 'Touch', sub: 'Skin → S1 (parietal)', color: 0x46d39a, dest: 'parietal',
    relay: 'Ventral posterolateral nucleus (thalamus)', destArea: 'Primary somatosensory cortex (postcentral gyrus)',
    path: [[0.15, -1.05, 0.0], [0.05, -0.66, 0.05], [0.0, -0.4, 0.0], [0.12, 0.0, -0.02], [0.22, 0.46, 0.07]],
    body: `Receptors in skin, muscle and joints sense touch, temperature, pain and body position. Signals travel up the spinal cord, cross the midline in the brainstem, and relay through the thalamus (VPL) to the primary somatosensory cortex in the parietal lobe — which holds a "homunculus" map of the body.`,
    cite: 'Penfield & Boldrey 1937 (homunculus); Kandel 6e.',
  },
  smell: {
    name: 'Smell', sub: 'Nose → olfactory cortex', color: 0xff7ad0, dest: 'temporal',
    relay: 'None — bypasses the thalamus', destArea: 'Piriform / olfactory cortex',
    path: [[0.0, -0.22, 1.05], [0.0, -0.30, 0.62], [0.12, -0.24, 0.40], [0.24, -0.20, 0.28]],
    body: `Smell is the exception: odour molecules activate receptors in the nose that connect to the olfactory bulb, which projects almost directly to the olfactory (piriform) cortex — without first relaying through the thalamus. This direct line to memory and emotion centres is why smells trigger such vivid recollections.`,
    cite: 'Kandel 6e (olfaction); Shepherd, olfactory bulb.',
  },
  taste: {
    name: 'Taste', sub: 'Tongue → gustatory cortex', color: 0x5ff0a8, dest: 'frontal',
    relay: 'Ventral posteromedial nucleus (thalamus)', destArea: 'Gustatory cortex (insula / operculum)',
    path: [[0.0, -0.55, 0.80], [0.0, -0.5, 0.30], [0.0, -0.48, 0.02], [0.12, -0.02, 0.0], [0.42, -0.04, 0.14]],
    body: `Taste buds detect sweet, salty, sour, bitter and umami. Signals run via cranial nerves to the brainstem (nucleus of the solitary tract), relay through the thalamus (VPM), and reach the gustatory cortex in the insula and frontal operculum — where taste blends with smell and texture into flavour.`,
    cite: 'Kandel 6e (gustatory system).',
  },
};

/* ---- Desikan-Killiany atlas (real fsaverage parcellation) ----
   Maps each of the 34 DK cortical regions (+ medial wall) to a lobe (for colour)
   and, for the notable ones, a friendly name + function for the detail panel. */
export const EXT_LOBE_COLORS = {
  frontal: 0x4f8cff, parietal: 0x46d39a, temporal: 0xffa14a, occipital: 0xb36bff,
  cingulate: 0xf2c14e, insula: 0x57e0b0, other: 0x6a6f7e,
};
export const EXT_LOBE_NAMES = {
  frontal: 'Frontal lobe', parietal: 'Parietal lobe', temporal: 'Temporal lobe',
  occipital: 'Occipital lobe', cingulate: 'Cingulate cortex', insula: 'Insula', other: 'Medial wall',
};
export const DK_LOBES = {
  superiorfrontal: 'frontal', rostralmiddlefrontal: 'frontal', caudalmiddlefrontal: 'frontal',
  parsopercularis: 'frontal', parstriangularis: 'frontal', parsorbitalis: 'frontal',
  lateralorbitofrontal: 'frontal', medialorbitofrontal: 'frontal', precentral: 'frontal',
  paracentral: 'frontal', frontalpole: 'frontal',
  superiorparietal: 'parietal', inferiorparietal: 'parietal', supramarginal: 'parietal',
  postcentral: 'parietal', precuneus: 'parietal',
  superiortemporal: 'temporal', middletemporal: 'temporal', inferiortemporal: 'temporal',
  bankssts: 'temporal', fusiform: 'temporal', transversetemporal: 'temporal',
  entorhinal: 'temporal', temporalpole: 'temporal', parahippocampal: 'temporal',
  lateraloccipital: 'occipital', lingual: 'occipital', pericalcarine: 'occipital', cuneus: 'occipital',
  rostralanteriorcingulate: 'cingulate', caudalanteriorcingulate: 'cingulate',
  posteriorcingulate: 'cingulate', isthmuscingulate: 'cingulate',
  insula: 'insula', unknown: 'other', corpuscallosum: 'other',
};
export const DK_INFO = {
  precentral:      { name: 'Precentral gyrus', tag: 'Primary motor cortex (M1)', body: 'Commands voluntary movement of the opposite side of the body, mapped as a "motor homunculus".' },
  postcentral:     { name: 'Postcentral gyrus', tag: 'Primary somatosensory cortex (S1)', body: 'Receives touch, temperature, pain and body-position signals from the opposite side of the body.' },
  superiortemporal:{ name: 'Superior temporal gyrus', tag: 'Auditory & language', body: 'Holds the auditory cortex; its posterior part (Wernicke’s area) is central to understanding speech.' },
  transversetemporal:{ name: 'Heschl’s gyrus', tag: 'Primary auditory cortex (A1)', body: 'The first cortical stop for sound arriving from the ears via the thalamus.' },
  parsopercularis: { name: 'Pars opercularis', tag: 'Broca’s area', body: 'Part of Broca’s area (usually left) — speech production and grammar.' },
  parstriangularis:{ name: 'Pars triangularis', tag: 'Broca’s area', body: 'Part of Broca’s area — language production and semantic selection.' },
  pericalcarine:   { name: 'Pericalcarine cortex', tag: 'Primary visual cortex (V1)', body: 'The first cortical stop for vision, around the calcarine sulcus.' },
  lateraloccipital:{ name: 'Lateral occipital cortex', tag: 'Object vision', body: 'Higher visual area for recognising objects, shapes and motion.' },
  cuneus:          { name: 'Cuneus', tag: 'Vision', body: 'Processes the lower visual field; early visual area.' },
  lingual:         { name: 'Lingual gyrus', tag: 'Vision', body: 'Processes the upper visual field, including word and colour information.' },
  fusiform:        { name: 'Fusiform gyrus', tag: 'Faces & words', body: 'Recognises faces (fusiform face area) and written words.' },
  entorhinal:      { name: 'Entorhinal cortex', tag: 'Memory gateway', body: 'The gateway between cortex and hippocampus — and the very first region damaged in Alzheimer’s.' },
  parahippocampal: { name: 'Parahippocampal gyrus', tag: 'Memory & places', body: 'Encodes memories and recognises scenes and places.' },
  superiorfrontal: { name: 'Superior frontal gyrus', tag: 'Planning & working memory', body: 'Supports working memory, planning and self-awareness.' },
  rostralmiddlefrontal:{ name: 'Rostral middle frontal gyrus', tag: 'Executive control (DLPFC)', body: 'Dorsolateral prefrontal cortex — reasoning, attention and decision-making.' },
  frontalpole:     { name: 'Frontal pole', tag: 'Abstract thought', body: 'The most anterior cortex — abstract reasoning, planning and complex decisions.' },
  lateralorbitofrontal:{ name: 'Lateral orbitofrontal cortex', tag: 'Reward & smell', body: 'Evaluates reward and punishment; receives smell input and guides decisions.' },
  medialorbitofrontal: { name: 'Medial orbitofrontal cortex', tag: 'Value & emotion', body: 'Tracks the value of choices and links emotion to decision-making.' },
  paracentral:     { name: 'Paracentral lobule', tag: 'Leg motor/sensory', body: 'Motor and sensory cortex for the opposite leg and foot; helps control the bladder.' },
  supramarginal:   { name: 'Supramarginal gyrus', tag: 'Language & touch', body: 'Part of the language network; integrates touch and spatial information.' },
  inferiorparietal:{ name: 'Inferior parietal lobule', tag: 'Integration hub', body: 'Binds vision, sound and touch; involved in attention, maths and language.' },
  superiorparietal:{ name: 'Superior parietal lobule', tag: 'Spatial sense', body: 'Spatial orientation and guiding movement using visual information.' },
  precuneus:       { name: 'Precuneus', tag: 'Self & imagery', body: 'Self-referential thought, visual imagery and the default-mode network.' },
  insula:          { name: 'Insula', tag: 'Body state, taste, empathy', body: 'Senses the internal state of the body (interoception); processes taste, disgust and empathy.' },
  rostralanteriorcingulate:{ name: 'Anterior cingulate (rostral)', tag: 'Emotion & conflict', body: 'Regulates emotion and monitors conflict and errors.' },
  caudalanteriorcingulate: { name: 'Anterior cingulate (caudal)', tag: 'Cognitive control', body: 'Detects conflict and allocates cognitive control and effort.' },
  posteriorcingulate:{ name: 'Posterior cingulate', tag: 'Default-mode network', body: 'A hub of the default-mode network — memory retrieval and self-reflection.' },
  isthmuscingulate:{ name: 'Retrosplenial / isthmus', tag: 'Memory & navigation', body: 'Links memory and spatial navigation systems.' },
  middletemporal:  { name: 'Middle temporal gyrus', tag: 'Meaning & motion', body: 'Recognises objects and word meaning; nearby area MT processes visual motion.' },
  inferiortemporal:{ name: 'Inferior temporal gyrus', tag: 'Object recognition', body: 'The end of the "what" visual stream — recognising objects regardless of size or angle.' },
  temporalpole:    { name: 'Temporal pole', tag: 'Semantic & social', body: 'Stores semantic knowledge and supports social and emotional understanding.' },
  bankssts:        { name: 'Banks of the STS', tag: 'Social perception', body: 'Processes biological motion, faces and aspects of language.' },
  caudalmiddlefrontal:{ name: 'Caudal middle frontal gyrus', tag: 'Eye movements & control', body: 'Includes the frontal eye fields — directs voluntary eye movements and attention.' },
  parsorbitalis:   { name: 'Pars orbitalis', tag: 'Language', body: 'Anterior inferior frontal gyrus, part of the language and semantic network.' },
};
