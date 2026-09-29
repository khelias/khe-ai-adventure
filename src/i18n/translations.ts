import type { Language } from '../game/types'

interface StringTable {
  appTitle: string
  appHeaderTitle: string
  kheHomeAria: string
  languageToggleLabel: string
  languageEstonian: string
  languageEnglish: string
  footerLinksLabel: string
  footerPrivacyLink: string
  footerHosting: string
  footerAiDisclosure: string
  adultsConfirmLabel: string
  aiInputHint: string
  storyCopyCredit: string
  playerCountLabel: string
  playerCountQuestion: string
  durationQuestion: string
  adventureKicker: string
  castKicker: string
  yourAdventureKicker: string
  storyToldKicker: string
  backToSetup: string
  loadingStoryTitle: string
  playersAriaLabel: (n: number) => string
  vibeBtnAny: string
  vibeBtnLight: string
  vibeBtnTense: string
  vibeBtnDark: string
  advancedToggle: string
  experimentalSettings: string
  nextStepBtn: string
  prevStepBtn: string
  step1Title: string
  step2Title: string
  step3Title: string
  step4Title: string
  setupStepLabel: (step: number, total: number) => string
  setupBasicsHeader: string
  setupBasicsHint: string
  setupStageLabel: string
  previousGenreBtn: string
  nextGenreBtn: string
  showGenreListBtn: string
  hideGenreListBtn: string
  genrePosition: (current: number, total: number) => string
  genreTeaser: (genre: string) => string
  durationTeaser: (duration: string) => string
  setupReviewHeader: string
  setupReviewNoLocation: string
  setupContextNote: string
  playerNamesHeader: string
  playerNamesHint: string
  playerNamesNote: string
  groupSectionHeader: string
  groupSectionHint: string
  locationNote: string
  ideaSectionHeader: string
  ideaSectionHint: string
  locationLabel: string
  locationPlaceholder: string
  playersDescLabel: string
  playersDescPlaceholder: string
  vibeLabel: string
  vibeAny: string
  vibeLight: string
  vibeTense: string
  vibeDark: string
  insideJokeLabel: string
  insideJokePlaceholder: string
  customChoiceLink: string
  customChoicePlaceholder: string
  customChoiceSubmit: string
  customChoiceCancel: string
  genreLabel: string
  genreZombies: string
  genreFantasy: string
  genreSciFi: string
  genreThriller: string
  genreCyberpunk: string
  genrePostApocalyptic: string
  durationLabel: string
  durationShort: string
  durationMedium: string
  durationLong: string
  providerLabel: string
  providerClaude: string
  providerGemini: string
  providerMock: string
  generateStoryBtn: string
  storyChoiceTitle: string
  regenerateBtn: string
  customStoryTitle: string
  customStoryPlaceholder: string
  useCustomStoryBtn: string
  useThisStoryBtn: string
  roleAssignTitle: string
  startGameBtn: string
  parametersTitle: string
  sceneTitle: string
  choiceTitle: string
  summaryTitle: string
  sequelLabel: string
  sequelHint: string
  restartBtn: string
  continueSequelBtn: string
  abilityLabel: string
  abilityChoiceMeta: (name: string) => string
  abilityActionBtn: string
  abilityPanelTitle: string
  abilityPanelHint: string
  abilityUseBtn: string
  abilityUsedAll: string
  turn: string
  durationDisplay: string
  playerName: string
  playerNamePlaceholder: string
  usedLabel: string
  defaultNamesBtn: string
  sceneLabel: string
  showFullStoryBtn: string
  hideFullStoryBtn: string
  copyStoryBtn: string
  copiedMsg: string
  downloadTranscriptBtn: string
  gameResultTitle: string
  endingStoryTitle: string
  finalParametersTitle: string
  winnersTitle: string
  winnersList: (names: string) => string
  noSecretWinners: string
  parameterEventKicker: string
  parameterEventTitle: (name: string) => string
  parameterStateChange: (from: string, to: string) => string
  parameterEventImproved: string
  parameterEventWorsened: string
  parameterStatusAria: (name: string, state: string) => string
  endNarrative: string
  endParametric: string
  endGenericText: string
  loading: string
  endParametricText: (paramName: string, state: string) => string
  errorApi: (msg: string) => string
  errorStart: (msg: string) => string
  errorSequel: (msg: string) => string
  errorCustom: (msg: string) => string
  // Secrets
  secretsKicker: string
  secretsAssignIntro: string
  secretsAssignWarning: string
  secretsPassPhoneTo: (name: string) => string
  secretsHandoffTitle: (name: string) => string
  secretsHandoffMeta: (current: number, total: number) => string
  secretsPrivacyNote: string
  secretsDossierLabel: string
  secretsGoalTypeLabel: string
  secretsTargetLabel: string
  secretsRevealBtn: (name: string) => string
  secretsRememberBtn: string
  secretsHideBtn: string
  secretsRevealKicker: string
  secretsRevealIntro: string
  secretsShowResultsBtn: string
  secretsResultWon: string
  secretsResultLost: string
  secretsYourGoalLabel: string
  secretsDocumentStamp: string
  secretsGoalFor: (name: string) => string
  secretArchetypeName: (archetype: string) => string
  secretDescription: (archetype: string, paramName?: string) => string
  // Rotating hints shown during the between-turns wait so 20-30s feels
  // purposeful, not broken. Cycled every 4s client-side.
  loadingHints: string[]
}

export const translations: Record<Language, StringTable> = {
  et: {
    appTitle: 'AI Seiklusmootor',
    appHeaderTitle: 'AI Seiklus',
    kheHomeAria: 'KHE Games avaleht',
    languageToggleLabel: 'Keel',
    languageEstonian: 'Eesti',
    languageEnglish: 'English',
    footerLinksLabel: 'Lehe lingid',
    footerPrivacyLink: 'Privaatsus',
    footerHosting: 'Self-hosted in Tallinn',
    footerAiDisclosure: '18+ · Lugu kirjutab tehisintellekt',
    adultsConfirmLabel: 'Kinnitan, et kõik mängijad on vähemalt 18-aastased',
    aiInputHint: 'Siia kirjutatu saadetakse loo loomiseks tehisintellekti teenusepakkujale. Kirjuta ainult seda, millega kõik laua ääres nõus on.',
    storyCopyCredit: 'Lugu on loodud tehisintellektiga · games.khe.ee/adventure',
    playerCountLabel: 'Mängijate arv:',
    playerCountQuestion: 'Mängijate arv',
    durationQuestion: 'Mängu kestus',
    adventureKicker: 'mängu algus',
    castKicker: 'rollid',
    yourAdventureKicker: 'teie seiklus',
    storyToldKicker: 'lugu on räägitud',
    backToSetup: 'seadistused',
    loadingStoryTitle: 'Seiklus valmib…',
    playersAriaLabel: (n) => `${n} mängijat`,
    vibeBtnAny: 'üllata',
    vibeBtnLight: 'kergem',
    vibeBtnTense: 'pingeline',
    vibeBtnDark: 'tume',
    advancedToggle: 'Tehniline valik',
    experimentalSettings: 'Täpsemad mudelivalikud',
    nextStepBtn: 'Järgmine samm →',
    prevStepBtn: '← Tagasi',
    step1Title: 'Vali seikluse suund',
    step2Title: 'Kes mängivad?',
    step3Title: 'Kus seiklus algab?',
    step4Title: 'Viimane detail',
    setupStepLabel: (step, total) => `${step} / ${total}`,
    setupBasicsHeader: 'Mängu kestus',
    setupBasicsHint: 'Vali, kui pikaks õhtuks see mäng mõeldud on. Seltskonna paned paika järgmises sammus.',
    setupStageLabel: 'Seikluse laad',
    previousGenreBtn: 'Eelmine žanr',
    nextGenreBtn: 'Järgmine žanr',
    showGenreListBtn: 'Vali žanr nimekirjast',
    hideGenreListBtn: 'Peida žanrite nimekiri',
    genrePosition: (current, total) => `${current} / ${total}`,
    genreTeaser: (genre) => ({
      Zombies: 'Ellujäämine, surve ja otsused, mis lähevad kiiresti isiklikuks.',
      Fantasy: 'Võõrad jõud, vandetõotused ja valikud, mille hind kasvab.',
      'Sci-Fi': 'Katkised süsteemid, võimatud signaalid ja meeskond piiripeal.',
      Thriller: 'Vaiksed ohud, napp info ja tunne, et keegi varjab midagi.',
      Cyberpunk: 'Neoon, võlg, katkised liidud ja süsteem, mis mängib vastu.',
      'Post-Apocalyptic': 'Ressursid on otsas, usaldus on habras ja iga valik maksab.',
    }[genre] ?? 'Vali toon, mille ümber seiklus ennast kokku tõmbab.'),
    durationTeaser: (duration) => ({
      Short: 'Kiire mäng: surve jõuab lauale peaaegu kohe.',
      Medium: 'Tasakaalus mäng: ruumi avastamiseks ja korralikuks pöördeks.',
      Long: 'Pikem mäng: rohkem eskalatsiooni ja rohkem ruumi saladustele.',
    }[duration] ?? 'Vali tempo, mis sobib tänasele õhtule.'),
    setupReviewHeader: 'Mängu ülevaade',
    setupReviewNoLocation: 'Koht lisamata',
    setupContextNote: 'Vabatahtlik. Kui midagi head ei tule pähe, alusta ilma selleta.',
    playerNamesHeader: 'Seltskond',
    playerNamesHint: 'Vali mängijate arv ja lisa soovi korral nimed või lühike kirjeldus seltskonnast.',
    playerNamesNote: 'Mängijate arv mõjutab rolle ja saladusi. Nimed on soovituslikud.',
    groupSectionHeader: 'Koht ja toon',
    groupSectionHint: 'Alusta sellest, kus te praegu olete. Siis on kohe huvitav näha, kuidas tuttav koht seikluseks muutub.',
    locationNote: 'Koht on kõige kasulikum kontekst. Meeleolu võib vabalt jääda üllatuseks.',
    ideaSectionHeader: 'Üks detail, mitte juhend',
    ideaSectionHint: 'Lisa ainult üks asi, mida oleks põnev seikluses näha. See võib olla tänane nali, ese laual või väike ebamugav olukord.',
    locationLabel: 'Kus te praegu olete?',
    locationPlaceholder: 'nt köögilaua ääres, kontori köögis, bussipeatuses...',
    playersDescLabel: 'Kes kaasa löövad?',
    playersDescPlaceholder: 'nt Mart, Mari ja Jaan või kogu sünnipäevaseltskond',
    vibeLabel: 'Meeleolu',
    vibeAny: 'Mis tuleb, see tuleb',
    vibeLight: 'Kerge & naljakas',
    vibeTense: 'Pingeline & tõsine',
    vibeDark: 'Tume & atmosfäärne',
    insideJokeLabel: 'Detail, mida seiklus võib kasutada',
    insideJokePlaceholder: 'nt keegi unustas täna võtmed maha',
    customChoiceLink: 'Kirjuta oma valik',
    customChoicePlaceholder: 'Mida grupp teeb?',
    customChoiceSubmit: 'Kinnita',
    customChoiceCancel: 'Tühista',
    genreLabel: 'Žanr',
    genreZombies: 'Zombid',
    genreFantasy: 'Fantaasia',
    genreSciFi: 'Ulme',
    genreThriller: 'Põnevik',
    genreCyberpunk: 'Küberpunk',
    genrePostApocalyptic: 'Postapokalüptiline',
    durationLabel: 'Mängu kestus',
    durationShort: 'Lühike (~5-8 käiku)',
    durationMedium: 'Keskmine (~9-15 käiku)',
    durationLong: 'Pikk (16+ käiku)',
    providerLabel: 'AI mudel',
    providerClaude: 'Claude',
    providerGemini: 'Gemini',
    providerMock: 'Mock',
    generateStoryBtn: 'Koosta seiklus →',
    storyChoiceTitle: 'Teie seiklus',
    regenerateBtn: 'Genereeri uus',
    customStoryTitle: 'Kirjuta oma algus',
    customStoryPlaceholder:
      'Näiteks: Ellujäänud on varjunud vanasse kaubamajja, kuid toiduvarud on lõppemas ja hord läheneb...',
    useCustomStoryBtn: 'Kasuta seda algust',
    useThisStoryBtn: 'Vali see lugu',
    roleAssignTitle: 'Määra rollid ja nimed',
    startGameBtn: 'Alusta mängu',
    parametersTitle: 'Parameetrid',
    sceneTitle: 'Praegune olukord',
    choiceTitle: 'Mida te teete?',
    summaryTitle: 'Kokkuvõte',
    sequelLabel: 'Jätka lugu',
    sequelHint: 'Muuda järgmise seikluse lähtekohta või jätka nii nagu on.',
    restartBtn: 'Alusta uuesti',
    continueSequelBtn: 'Jätka järjelooga',
    abilityLabel: 'Erioskus',
    abilityChoiceMeta: (name) => `Erioskus · ${name}`,
    abilityActionBtn: 'Kasuta erioskust',
    abilityPanelTitle: 'Erioskuste kasutamine',
    abilityPanelHint: 'Kasutatud oskused jäävad halliks. Valige oskus ainult siis, kui mängija tahab selle praegu välja mängida.',
    abilityUseBtn: 'Kasuta',
    abilityUsedAll: 'Kõik erioskused kasutatud',
    turn: 'Käik',
    durationDisplay: 'Kestus',
    playerName: 'Mängija',
    playerNamePlaceholder: 'Soovi korral sisesta uus nimi',
    usedLabel: 'Kasutatud',
    defaultNamesBtn: 'Kasuta nimesid Mängija 1, 2, 3…',
    sceneLabel: 'Stseen',
    showFullStoryBtn: 'Näita kogu lugu',
    hideFullStoryBtn: 'Peida kogu lugu',
    copyStoryBtn: 'Kopeeri tekst',
    copiedMsg: 'Kopeeritud!',
    downloadTranscriptBtn: 'Laadi JSON alla',
    gameResultTitle: 'Tulemus',
    endingStoryTitle: 'Lõpulugu',
    finalParametersTitle: 'Lõppseis',
    winnersTitle: 'Salajased võitjad',
    winnersList: (names) => `Võitsid: ${names}`,
    noSecretWinners: 'Seekord ei täitnud keegi oma salajast eesmärki.',
    parameterEventKicker: 'Tagajärg',
    parameterEventTitle: (name) => name,
    parameterStateChange: (from, to) => `${from} → ${to}`,
    parameterEventImproved: 'paranes',
    parameterEventWorsened: 'halvenes',
    parameterStatusAria: (name, state) => `${name}: ${state}`,
    endNarrative: 'Lugu jõudis lõpuni',
    endParametric: 'Olukord varises kokku',
    endGenericText: 'Seiklus on jõudnud ootamatu lõpuni.',
    loading: 'Laadin...',
    endParametricText: (paramName, state) =>
      `Olukord muutus lootusetuks. ${paramName} jõudis kriitilisele tasemele (${state}). Teie grupp ei pidanud vastu.`,
    errorApi: (msg) => `AI-ga suhtlemisel tekkis viga: ${msg}`,
    errorStart: (msg) => `Mängu alustamisel tekkis viga: ${msg}`,
    errorSequel: (msg) => `Järjeloo genereerimisel tekkis viga: ${msg}`,
    errorCustom: (msg) => `Uue loo genereerimisel tekkis viga: ${msg}`,
    secretsKicker: 'saladused',
    secretsAssignIntro: 'Igaüks saab ühe salajase eesmärgi. Teised ei tohi näha.',
    secretsAssignWarning: 'Teised, pöörake selg. Ära piilu üle õla.',
    secretsPassPhoneTo: (name) => `Telefon järgmisele mängijale: ${name}.`,
    secretsHandoffTitle: (name) => `Telefon ${name} kätte`,
    secretsHandoffMeta: (current, total) => `Mängija ${current} / ${total}`,
    secretsPrivacyNote: 'Ava kaart ainult siis, kui teised ei näe ekraani.',
    secretsDossierLabel: 'Salajane toimik',
    secretsGoalTypeLabel: 'Eesmärgi tüüp',
    secretsTargetLabel: 'Seotud parameeter',
    secretsRevealBtn: (name) => `${name}, ava salajane kaart`,
    secretsRememberBtn: 'Hoian meeles — anna edasi',
    secretsHideBtn: 'Peida',
    secretsRevealKicker: 'saladused paljastatud',
    secretsRevealIntro: 'Salajased eesmärgid ja tulemused.',
    secretsShowResultsBtn: 'Paljasta saladused →',
    secretsResultWon: 'Võitsid',
    secretsResultLost: 'Kaotasid',
    secretsYourGoalLabel: 'Sinu salajane eesmärk',
    secretsDocumentStamp: 'SALAJANE',
    secretsGoalFor: (name) => `${name} salajane eesmärk`,
    secretArchetypeName: (a) => ({
      optimist: 'Perfektsionist',
      traitor: 'Reetur',
      survivor: 'Ellujääja',
      keeper: 'Hoidja',
      sacrificer: 'Ohverdaja',
      guardian: 'Saladuse kaitsja',
    }[a] ?? a),
    secretDescription: (a, paramName) => ({
      optimist: 'Sinu eesmärk on täiuslik lõpp. Kõik põhiparameetrid peavad mängu lõpuks olema parimas olekus.',
      traitor: 'Sa töötad salaja grupile vastu. Võidad siis, kui mäng lõpeb kollapsiga — vähemalt kaks põhiparameetrit on halvimasse olekusse langenud.',
      survivor: 'Peaasi, et jõuate lõpuni ilma täieliku kollapsita. Võidad siis, kui lugu lõpeb narratiivselt ja vähem kui kaks parameetrit on põhjas.',
      keeper: `Sul on üks asi, mida hoida. «${paramName}» peab mängu lõpuks olema heas seisus — ülemises pooles.`,
      sacrificer: `Üks asi peab minema pihta — muidu sa ei võida. «${paramName}» peab jõudma halvimasse olekusse.`,
      guardian: 'Mitte midagi ei tohi lõplikult kaotsi minna. Ükski põhiparameeter ei tohi mängu lõpuks halvimasse olekusse jõuda.',
    }[a] ?? a),
    loadingHints: [
      'AI ragistab ajusid...',
      'AI põimib loo niite...',
      'Tegelaste saatus loksub paika...',
      'Järgmine stseen valmib...',
      'Tegelased peavad nõu...',
      'Eelmise valiku tagajärjed selginevad...',
    ],
  },
  en: {
    appTitle: 'AI Adventure Engine',
    appHeaderTitle: 'AI Adventure',
    kheHomeAria: 'KHE Games home',
    languageToggleLabel: 'Language',
    languageEstonian: 'Eesti',
    languageEnglish: 'English',
    footerLinksLabel: 'Page links',
    footerPrivacyLink: 'Privacy',
    footerHosting: 'Self-hosted in Tallinn',
    footerAiDisclosure: '18+ · The story is written by AI',
    adultsConfirmLabel: 'I confirm that all players are 18 or older',
    aiInputHint: 'What you type here is sent to the AI provider to write the story. Enter only what everyone at the table is fine with.',
    storyCopyCredit: 'Story generated with AI · games.khe.ee/adventure',
    playerCountLabel: 'Number of players',
    playerCountQuestion: 'Number of players',
    durationQuestion: 'Game length',
    adventureKicker: 'game setup',
    castKicker: 'cast',
    yourAdventureKicker: 'your adventure',
    storyToldKicker: 'the story is told',
    backToSetup: 'setup',
    loadingStoryTitle: 'The story is forming…',
    playersAriaLabel: (n) => `${n} players`,
    vibeBtnAny: 'open',
    vibeBtnLight: 'light',
    vibeBtnTense: 'tense',
    vibeBtnDark: 'dark',
    advancedToggle: 'Technical',
    experimentalSettings: 'Advanced model options',
    nextStepBtn: 'Next step →',
    prevStepBtn: '← Back',
    step1Title: 'Choose the adventure',
    step2Title: 'Who is playing?',
    step3Title: 'Where does it start?',
    step4Title: 'Final detail',
    setupStepLabel: (step, total) => `${step} / ${total}`,
    setupBasicsHeader: 'Game length',
    setupBasicsHint: 'Choose how long this session should run. The group comes next.',
    setupStageLabel: 'Adventure style',
    previousGenreBtn: 'Previous genre',
    nextGenreBtn: 'Next genre',
    showGenreListBtn: 'Choose from genre list',
    hideGenreListBtn: 'Hide genre list',
    genrePosition: (current, total) => `${current} / ${total}`,
    genreTeaser: (genre) => ({
      Zombies: 'Survival, pressure, and decisions that get personal fast.',
      Fantasy: 'Strange powers, oaths, and choices whose price keeps rising.',
      'Sci-Fi': 'Broken systems, impossible signals, and a crew on the edge.',
      Thriller: 'Quiet threats, partial information, and the sense that someone is hiding something.',
      Cyberpunk: 'Neon, debt, broken alliances, and a system pushing back.',
      'Post-Apocalyptic': 'Resources are gone, trust is fragile, and every choice costs something.',
    }[genre] ?? 'Choose the tone the adventure should gather around.'),
    durationTeaser: (duration) => ({
      Short: 'Fast game: pressure reaches the table almost immediately.',
      Medium: 'Balanced game: room to explore and still land a proper twist.',
      Long: 'Longer game: more escalation and more space for secrets.',
    }[duration] ?? 'Choose the pace that fits tonight.'),
    setupReviewHeader: 'Game overview',
    setupReviewNoLocation: 'No place added',
    setupContextNote: 'This field is optional. If nothing good comes to mind, start without it.',
    playerNamesHeader: 'The group',
    playerNamesHint: 'Choose the number of players and optionally add names or a short description of the group.',
    playerNamesNote: 'Player count affects roles and secrets. Names are optional.',
    groupSectionHeader: 'Place and tone',
    groupSectionHint: 'Start with where you are right now. It is more interesting when a familiar place turns into the adventure.',
    locationNote: 'Place is the most useful context. Mood can stay open if you want to be surprised.',
    ideaSectionHeader: 'One detail, not a brief',
    ideaSectionHint: 'Add one thing that would be fun to see in the adventure: an in-joke, an object on the table, or a small awkward situation.',
    locationLabel: 'Where are you right now?',
    locationPlaceholder: 'e.g. around the kitchen table, office kitchen, bus stop...',
    playersDescLabel: 'Who is joining?',
    playersDescPlaceholder: 'e.g. Alex, Sarah, and John, or the whole birthday table',
    vibeLabel: 'Mood',
    vibeAny: 'Whatever happens, happens',
    vibeLight: 'Light & humorous',
    vibeTense: 'Tense & serious',
    vibeDark: 'Dark & atmospheric',
    insideJokeLabel: 'A detail the adventure could use',
    insideJokePlaceholder: 'e.g. someone forgot their keys today',
    customChoiceLink: 'Write your own choice',
    customChoicePlaceholder: 'What does the group do?',
    customChoiceSubmit: 'Confirm',
    customChoiceCancel: 'Cancel',
    genreLabel: 'Genre',
    genreZombies: 'Zombies',
    genreFantasy: 'Fantasy',
    genreSciFi: 'Sci-Fi',
    genreThriller: 'Thriller',
    genreCyberpunk: 'Cyberpunk',
    genrePostApocalyptic: 'Post-Apocalyptic',
    durationLabel: 'Game length',
    durationShort: 'Short (~5-8 turns)',
    durationMedium: 'Medium (~9-15 turns)',
    durationLong: 'Long (16+ turns)',
    providerLabel: 'AI model',
    providerClaude: 'Claude',
    providerGemini: 'Gemini',
    providerMock: 'Mock',
    generateStoryBtn: 'Start game →',
    storyChoiceTitle: 'Your adventure',
    regenerateBtn: 'Regenerate',
    customStoryTitle: 'Write your own premise',
    customStoryPlaceholder:
      'Example: The survivors are hiding in an old mall, but food is running out and the horde is approaching...',
    useCustomStoryBtn: 'Use this premise',
    useThisStoryBtn: 'Choose this story',
    roleAssignTitle: 'Assign roles and names',
    startGameBtn: 'Start game!',
    parametersTitle: 'Group status',
    sceneTitle: 'Current situation',
    choiceTitle: 'What do you do?',
    summaryTitle: 'Summary:',
    sequelLabel: 'Continue the story',
    sequelHint: 'Edit the starting point for the next adventure, or leave it as is.',
    restartBtn: 'Restart',
    continueSequelBtn: 'Continue with a sequel',
    abilityLabel: 'Special ability',
    abilityChoiceMeta: (name) => `Special ability · ${name}`,
    abilityActionBtn: 'Use special ability',
    abilityPanelTitle: 'Special abilities',
    abilityPanelHint: 'Used abilities stay disabled. Choose one only when that player wants to spend it now.',
    abilityUseBtn: 'Use',
    abilityUsedAll: 'All special abilities used',
    turn: 'Turn',
    durationDisplay: 'Duration',
    playerName: 'Player',
    playerNamePlaceholder: 'Enter new name if desired',
    usedLabel: 'Used',
    defaultNamesBtn: 'Use Player 1, 2, 3…',
    sceneLabel: 'Scene',
    showFullStoryBtn: 'Show full story',
    hideFullStoryBtn: 'Hide full story',
    copyStoryBtn: 'Copy text',
    copiedMsg: 'Copied!',
    downloadTranscriptBtn: 'Download JSON',
    gameResultTitle: 'Result',
    endingStoryTitle: 'Ending',
    finalParametersTitle: 'Final state',
    winnersTitle: 'Secret winners',
    winnersList: (names) => `Winners: ${names}`,
    noSecretWinners: 'No one completed their secret goal this time.',
    parameterEventKicker: 'Consequence',
    parameterEventTitle: (name) => name,
    parameterStateChange: (from, to) => `${from} → ${to}`,
    parameterEventImproved: 'improved',
    parameterEventWorsened: 'worsened',
    parameterStatusAria: (name, state) => `${name}: ${state}`,
    endNarrative: 'Narrative End',
    endParametric: 'Parametric Loss',
    endGenericText: 'The adventure has come to an unexpected end.',
    loading: 'Loading...',
    endParametricText: (paramName, state) =>
      `The situation became hopeless. ${paramName} reached a critical level (${state}). Your group did not make it.`,
    errorApi: (msg) =>
      `An error occurred while communicating with the AI: ${msg}`,
    errorStart: (msg) =>
      `An error occurred while starting the game: ${msg}`,
    errorSequel: (msg) =>
      `An error occurred while generating the sequel: ${msg}`,
    errorCustom: (msg) =>
      `An error occurred while generating the new story: ${msg}`,
    secretsKicker: 'secrets',
    secretsAssignIntro: 'Each player gets one secret goal. No one else may see it.',
    secretsAssignWarning: 'Others, turn your backs. No peeking over the shoulder.',
    secretsPassPhoneTo: (name) => `Phone to next player: ${name}.`,
    secretsHandoffTitle: (name) => `Hand the phone to ${name}`,
    secretsHandoffMeta: (current, total) => `Player ${current} / ${total}`,
    secretsPrivacyNote: 'Open the card only when no one else can see the screen.',
    secretsDossierLabel: 'Secret dossier',
    secretsGoalTypeLabel: 'Goal type',
    secretsTargetLabel: 'Linked parameter',
    secretsRevealBtn: (name) => `${name}, open your secret card`,
    secretsRememberBtn: 'Got it — pass it on',
    secretsHideBtn: 'Hide',
    secretsRevealKicker: 'secrets revealed',
    secretsRevealIntro: 'Secret goals and results.',
    secretsShowResultsBtn: 'Reveal the secrets →',
    secretsResultWon: 'Won',
    secretsResultLost: 'Lost',
    secretsYourGoalLabel: 'Your secret goal',
    secretsDocumentStamp: 'SECRET',
    secretsGoalFor: (name) => `${name}'s secret goal`,
    secretArchetypeName: (a) => ({
      optimist: 'Perfectionist',
      traitor: 'Traitor',
      survivor: 'Survivor',
      keeper: 'Keeper',
      sacrificer: 'Sacrificer',
      guardian: 'Guardian',
    }[a] ?? a),
    secretDescription: (a, paramName) => ({
      optimist: 'You want a perfect finish. Every core parameter must end at its best state.',
      traitor: 'You are secretly working against the group. You win if the game ends in collapse — at least two core parameters at their worst state.',
      survivor: 'Just get everyone to the end without full collapse. You win if the story ends narratively and fewer than two parameters are at their worst state.',
      keeper: `You hold one thing dear. «${paramName}» must end in the top half.`,
      sacrificer: `One thing must fall — or you don't win. «${paramName}» must reach its worst state.`,
      guardian: 'Nothing may be lost for good. No core parameter may end at its worst state.',
    }[a] ?? a),
    loadingHints: [
      'The AI is racking its brains...',
      'Weaving narrative threads...',
      'Character fates are being decided...',
      'Writing the next scene...',
      'The characters are conferring...',
      'The last choice is taking effect...',
    ],
  },
}

export function useT(language: Language): StringTable {
  return translations[language]
}
