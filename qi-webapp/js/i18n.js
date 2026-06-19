/* QI Platform - i18n: Internationalization */
(function () {
  "use strict";

  var LANGS = [
    { code: "en", label: "English", flag: "\ud83c\uddec\ud83c\udde7" },
    { code: "da", label: "Dansk", flag: "\ud83c\udde9\ud83c\uddf0" },
    { code: "fa", label: "\u0641\u0627\u0631\u0633\u06cc", flag: "\ud83c\uddee\ud83c\uddf7" }
  ];

  var DICT = {};

  DICT.en = {
    "group.overview":"Overview","group.delivery":"Delivery","group.riskquality":"Risk & Quality",
    "group.improve":"Improve","group.peoplecost":"People & Cost","group.visualization":"Visualization",
    "group.intelligence":"Intelligence","group.engineering":"Engineering","group.business":"Business","group.setup":"Setup",
    "nav.brain":"Project Brain","nav.investorbrief":"Investor Brief","nav.portfolio":"Portfolio",
    "nav.dashboard":"Dashboard","nav.cases":"Cases (Master)","nav.myitems":"My Items",
    "nav.pm":"PM Tasks","nav.kanban":"Kanban Board","nav.timeline":"Timeline",
    "nav.risks":"Risk Register","nav.fmea":"FMEA","nav.sigma":"Six Sigma",
    "nav.gage":"Gage R&R (MSA)","nav.riskmatrix":"Risk Matrix","nav.xbarr":"X\u0304-R Control Chart",
    "nav.capability":"Process Capability","nav.ncrpareto":"NCR Pareto","nav.pdca":"PDCA",
    "nav.log":"Action Log","nav.decisions":"Decision Log","nav.stakeholders":"Stakeholders",
    "nav.budget":"Budget","nav.globe3d":"3D Network Map","nav.routeprogress":"Route Progress",
    "nav.country":"Country Intelligence","nav.advisor":"Project Advisor (AI)",
    "nav.marketentry":"Market Entry","nav.licensing":"Licensing & Permits",
    "nav.landingpartners":"Landing Partners","nav.ai":"AI Assistant",
    "nav.impact":"Change Impact","nav.scorecard":"KPI Scorecard","nav.health":"Data Health",
    "nav.report":"Report Pack","nav.audit":"History & Backups","nav.config":"Settings","nav.help":"Help",
    "btn.share":"Share","btn.print":"Print","btn.export":"Export","btn.import":"Import",
    "btn.save":"Save","btn.cancel":"Cancel","btn.delete":"Delete","btn.close":"Close",
    "btn.add":"Add","btn.edit":"Edit","btn.apply":"Apply","btn.analyze":"Analyze",
    "btn.addItem":"+ Add an item","btn.tryExample":"Try an example",
    "btn.goToBrain":"Go to Project Brain","btn.logout":"Logout",
    "toast.projectSaved":"Project saved.","toast.exported":"Exported successfully.",
    "toast.imported":"Imported successfully.","toast.copied":"Copied to clipboard.",
    "toast.deleted":"Deleted.","toast.soundOn":"Notification sound on",
    "toast.soundOff":"Notification sound off","toast.checksPass":"All checks passed!",
    "toast.langChanged":"Language changed to %s",
    "empty.noItems":"No items yet. Go to Project Brain, upload a project description and click Analyze.",
    "empty.goToBrain":"Go to Project Brain",
    "auth.signIn":"Sign In","auth.register":"Register","auth.createAccount":"Create account",
    "auth.email":"Email","auth.password":"Password","auth.displayName":"Display name",
    "auth.noAccount":"No account?","auth.hasAccount":"Already have an account?",
    "auth.backToLogin":"Back to login","auth.mfaPrompt":"Enter your 6-digit authenticator code",
    "auth.totpCode":"TOTP Code","auth.recoveryCode":"Recovery code","auth.verify":"Verify",
    "auth.useRecovery":"Use a recovery code","auth.useTotp":"Use your authenticator instead",
    "auth.joinTeam":"Join Team","auth.inviteDesc":"You have been invited to join a team. Create your account to get started.",
    "auth.minChars":"Min %s characters","auth.joinTeamBtn":"Join Team",
    "label.search":"Search all items...","label.focusMode":"Focus mode",
    "label.darkMode":"Toggle dark mode","label.runChecks":"Run all checks",
    "label.help":"Keyboard shortcuts","label.language":"Language",
    "label.savedHint":"Auto-saved locally","label.session":"Session: %sm",
    "label.collapse":"Collapse sidebar","label.switchProject":"Switch project",
    "nav.previous":"Previous","nav.next":"Next",
    "guide.title":"AI suggests next:","guide.goTo":"Go to",
    "guide.start":"Start here \u2014 upload or paste your project description and the app builds the whole plan for you.",
    "guide.advisor":"See the AI's top priorities \u2014 what to do first to get the best result.",
    "guide.blocked":"item(s) are blocked right now \u2014 clear them first to unblock progress.",
    "guide.critical":"critical risk(s) need a named owner and a mitigation plan.",
    "guide.market":"Decide which countries to enter first.",
    "guide.licensing":"Start the slowest permits now \u2014 they decide your timeline.",
    "guide.timeline":"Check your milestones and target dates.",
    "guide.globe":"See the route and build progress on the 3D map.",
    "guide.brief":"Package it for investors and government stakeholders."
  };

  DICT.da = {
    "group.overview":"Oversigt","group.delivery":"Levering","group.riskquality":"Risiko & Kvalitet",
    "group.improve":"Forbedring","group.peoplecost":"Mennesker & Omkostninger","group.visualization":"Visualisering",
    "group.intelligence":"Efterretning","group.engineering":"Teknik","group.business":"Forretning","group.setup":"Ops\u00e6tning",
    "nav.brain":"Projekthjerne","nav.investorbrief":"Investoroversigt","nav.portfolio":"Portef\u00f8lje",
    "nav.dashboard":"Dashboard","nav.cases":"Sager (Master)","nav.myitems":"Mine Opgaver",
    "nav.pm":"PM Opgaver","nav.kanban":"Kanban Tavle","nav.timeline":"Tidslinje",
    "nav.risks":"Risikoregister","nav.fmea":"FMEA","nav.sigma":"Six Sigma",
    "nav.gage":"Gage R&R (MSA)","nav.riskmatrix":"Risikomatrix","nav.xbarr":"X\u0304-R Kontroldiagram",
    "nav.capability":"Proceskapabilitet","nav.ncrpareto":"NCR Pareto","nav.pdca":"PDCA",
    "nav.log":"Handlingslog","nav.decisions":"Beslutningslog","nav.stakeholders":"Interessenter",
    "nav.budget":"Budget","nav.globe3d":"3D Netv\u00e6rkskort","nav.routeprogress":"Rutefremskridt",
    "nav.country":"Landeefterretning","nav.advisor":"Projektr\u00e5dgiver (AI)",
    "nav.marketentry":"Markedsadgang","nav.licensing":"Licenser & Tilladelser",
    "nav.landingpartners":"Landingspartnere","nav.ai":"AI Assistent",
    "nav.impact":"\u00c6ndringseffekt","nav.scorecard":"KPI Scorecard","nav.health":"Datasundhed",
    "nav.report":"Rapportpakke","nav.audit":"Historik & Backup","nav.config":"Indstillinger","nav.help":"Hj\u00e6lp",
    "btn.share":"Del","btn.print":"Udskriv","btn.export":"Eksporter","btn.import":"Importer",
    "btn.save":"Gem","btn.cancel":"Annuller","btn.delete":"Slet","btn.close":"Luk",
    "btn.add":"Tilf\u00f8j","btn.edit":"Rediger","btn.apply":"Anvend","btn.analyze":"Analyser",
    "btn.addItem":"+ Tilf\u00f8j element","btn.tryExample":"Pr\u00f8v et eksempel",
    "btn.goToBrain":"G\u00e5 til Projekthjerne","btn.logout":"Log ud",
    "toast.projectSaved":"Projekt gemt.","toast.exported":"Eksporteret.",
    "toast.imported":"Importeret.","toast.copied":"Kopieret til udklipsholder.",
    "toast.deleted":"Slettet.","toast.soundOn":"Notifikationslyd til",
    "toast.soundOff":"Notifikationslyd fra","toast.checksPass":"Alle tjek best\u00e5et!",
    "toast.langChanged":"Sprog \u00e6ndret til %s",
    "empty.noItems":"Ingen elementer endnu. G\u00e5 til Projekthjerne, upload en projektbeskrivelse og klik Analyser.",
    "empty.goToBrain":"G\u00e5 til Projekthjerne",
    "auth.signIn":"Log ind","auth.register":"Registrer","auth.createAccount":"Opret konto",
    "auth.email":"Email","auth.password":"Adgangskode","auth.displayName":"Visningsnavn",
    "auth.noAccount":"Ingen konto?","auth.hasAccount":"Har du allerede en konto?",
    "auth.backToLogin":"Tilbage til login","auth.mfaPrompt":"Indtast din 6-cifrede autentificeringskode",
    "auth.totpCode":"TOTP Kode","auth.recoveryCode":"Gendannelseskode","auth.verify":"Bekr\u00e6ft",
    "auth.useRecovery":"Brug en gendannelseskode","auth.useTotp":"Brug din autentificeringsapp",
    "auth.joinTeam":"Tilslut Team","auth.inviteDesc":"Du er blevet inviteret til et team. Opret din konto for at komme i gang.",
    "auth.minChars":"Min %s tegn","auth.joinTeamBtn":"Tilslut Team",
    "label.search":"S\u00f8g i alle elementer...","label.focusMode":"Fokustilstand",
    "label.darkMode":"Skift m\u00f8rk tilstand","label.runChecks":"K\u00f8r alle tjek",
    "label.help":"Tastaturgenveje","label.language":"Sprog",
    "label.savedHint":"Auto-gemt lokalt","label.session":"Session: %sm",
    "label.collapse":"Skjul sidebjælke","label.switchProject":"Skift projekt",
    "nav.previous":"Forrige","nav.next":"N\u00e6ste",
    "guide.title":"AI foresl\u00e5r n\u00e6ste:","guide.goTo":"G\u00e5 til",
    "guide.start":"Start her \u2014 upload eller inds\u00e6t din projektbeskrivelse, s\u00e5 bygger appen hele planen for dig.",
    "guide.advisor":"Se AI'ens vigtigste prioriteter \u2014 hvad du skal g\u00f8re f\u00f8rst.",
    "guide.blocked":"element(er) er blokeret lige nu \u2014 ryd dem f\u00f8rst for at frig\u00f8re fremdrift.",
    "guide.critical":"kritisk(e) risici har brug for en ansvarlig og en handlingsplan.",
    "guide.market":"Beslut hvilke lande der skal indtr\u00e6des f\u00f8rst.",
    "guide.licensing":"Start de langsomste tilladelser nu \u2014 de afg\u00f8r din tidsplan.",
    "guide.timeline":"Tjek dine milep\u00e6le og m\u00e5ldatoer.",
    "guide.globe":"Se ruten og byggefremskridt p\u00e5 3D-kortet.",
    "guide.brief":"Pak det sammen til investorer og myndigheder."
  };

  DICT.fa = {
    "group.overview":"\u0646\u0645\u0627\u06cc \u06a9\u0644\u06cc","group.delivery":"\u062a\u062d\u0648\u06cc\u0644","group.riskquality":"\u0631\u06cc\u0633\u06a9 \u0648 \u06a9\u06cc\u0641\u06cc\u062a",
    "group.improve":"\u0628\u0647\u0628\u0648\u062f","group.peoplecost":"\u0627\u0641\u0631\u0627\u062f \u0648 \u0647\u0632\u06cc\u0646\u0647","group.visualization":"\u062a\u062c\u0633\u0645",
    "group.intelligence":"\u0647\u0648\u0634\u0645\u0646\u062f\u06cc","group.engineering":"\u0645\u0647\u0646\u062f\u0633\u06cc","group.business":"\u06a9\u0633\u0628 \u0648 \u06a9\u0627\u0631","group.setup":"\u062a\u0646\u0638\u06cc\u0645\u0627\u062a",
    "nav.brain":"\u0645\u063a\u0632 \u067e\u0631\u0648\u0698\u0647","nav.investorbrief":"\u062e\u0644\u0627\u0635\u0647 \u0633\u0631\u0645\u0627\u06cc\u0647\u200c\u06af\u0630\u0627\u0631\u06cc","nav.portfolio":"\u0633\u0628\u062f \u067e\u0631\u0648\u0698\u0647",
    "nav.dashboard":"\u062f\u0627\u0634\u0628\u0648\u0631\u062f","nav.cases":"\u0645\u0648\u0627\u0631\u062f (\u0627\u0635\u0644\u06cc)","nav.myitems":"\u0645\u0648\u0627\u0631\u062f \u0645\u0646",
    "nav.pm":"\u0648\u0638\u0627\u06cc\u0641 \u0645\u062f\u06cc\u0631\u06cc\u062a \u067e\u0631\u0648\u0698\u0647","nav.kanban":"\u062a\u0627\u0628\u0644\u0648 \u06a9\u0627\u0646\u0628\u0627\u0646","nav.timeline":"\u062c\u062f\u0648\u0644 \u0632\u0645\u0627\u0646\u06cc",
    "nav.risks":"\u062b\u0628\u062a \u0631\u06cc\u0633\u06a9","nav.fmea":"FMEA","nav.sigma":"\u0634\u0634 \u0633\u06cc\u06af\u0645\u0627",
    "nav.gage":"Gage R&R (MSA)","nav.riskmatrix":"\u0645\u0627\u062a\u0631\u06cc\u0633 \u0631\u06cc\u0633\u06a9","nav.xbarr":"\u0646\u0645\u0648\u062f\u0627\u0631 \u06a9\u0646\u062a\u0631\u0644 X-R",
    "nav.capability":"\u0642\u0627\u0628\u0644\u06cc\u062a \u0641\u0631\u0622\u06cc\u0646\u062f","nav.ncrpareto":"\u067e\u0627\u0631\u062a\u0648 NCR","nav.pdca":"PDCA",
    "nav.log":"\u06af\u0632\u0627\u0631\u0634 \u0627\u0642\u062f\u0627\u0645\u0627\u062a","nav.decisions":"\u06af\u0632\u0627\u0631\u0634 \u062a\u0635\u0645\u06cc\u0645\u0627\u062a","nav.stakeholders":"\u0630\u06cc\u0646\u0641\u0639\u0627\u0646",
    "nav.budget":"\u0628\u0648\u062f\u062c\u0647","nav.globe3d":"\u0646\u0642\u0634\u0647 \u0633\u0647\u200c\u0628\u0639\u062f\u06cc \u0634\u0628\u06a9\u0647","nav.routeprogress":"\u067e\u06cc\u0634\u0631\u0641\u062a \u0645\u0633\u06cc\u0631",
    "nav.country":"\u0627\u0637\u0644\u0627\u0639\u0627\u062a \u06a9\u0634\u0648\u0631\u06cc","nav.advisor":"\u0645\u0634\u0627\u0648\u0631 \u067e\u0631\u0648\u0698\u0647 (AI)",
    "nav.marketentry":"\u0648\u0631\u0648\u062f \u0628\u0647 \u0628\u0627\u0632\u0627\u0631","nav.licensing":"\u0645\u062c\u0648\u0632\u0647\u0627 \u0648 \u067e\u0631\u0648\u0627\u0646\u0647\u200c\u0647\u0627",
    "nav.landingpartners":"\u0634\u0631\u06a9\u0627\u06cc \u0641\u0631\u0648\u062f","nav.ai":"\u062f\u0633\u062a\u06cc\u0627\u0631 \u0647\u0648\u0634\u0645\u0646\u062f",
    "nav.impact":"\u062a\u0627\u062b\u06cc\u0631 \u062a\u063a\u06cc\u06cc\u0631\u0627\u062a","nav.scorecard":"\u06a9\u0627\u0631\u062a \u0627\u0645\u062a\u06cc\u0627\u0632\u06cc KPI","nav.health":"\u0633\u0644\u0627\u0645\u062a \u062f\u0627\u062f\u0647",
    "nav.report":"\u0628\u0633\u062a\u0647 \u06af\u0632\u0627\u0631\u0634","nav.audit":"\u062a\u0627\u0631\u06cc\u062e\u0686\u0647 \u0648 \u067e\u0634\u062a\u06cc\u0628\u0627\u0646","nav.config":"\u062a\u0646\u0638\u06cc\u0645\u0627\u062a","nav.help":"\u0631\u0627\u0647\u0646\u0645\u0627",
    "btn.share":"\u0627\u0634\u062a\u0631\u0627\u06a9","btn.print":"\u0686\u0627\u067e","btn.export":"\u062e\u0631\u0648\u062c\u06cc","btn.import":"\u0648\u0631\u0648\u062f\u06cc",
    "btn.save":"\u0630\u062e\u06cc\u0631\u0647","btn.cancel":"\u0644\u063a\u0648","btn.delete":"\u062d\u0630\u0641","btn.close":"\u0628\u0633\u062a\u0646",
    "btn.add":"\u0627\u0641\u0632\u0648\u062f\u0646","btn.edit":"\u0648\u06cc\u0631\u0627\u06cc\u0634","btn.apply":"\u0627\u0639\u0645\u0627\u0644","btn.analyze":"\u062a\u062d\u0644\u06cc\u0644",
    "btn.addItem":"+ \u0627\u0641\u0632\u0648\u062f\u0646 \u0645\u0648\u0631\u062f","btn.tryExample":"\u0627\u0645\u062a\u062d\u0627\u0646 \u0646\u0645\u0648\u0646\u0647",
    "btn.goToBrain":"\u0631\u0641\u062a\u0646 \u0628\u0647 \u0645\u063a\u0632 \u067e\u0631\u0648\u0698\u0647","btn.logout":"\u062e\u0631\u0648\u062c",
    "toast.projectSaved":"\u067e\u0631\u0648\u0698\u0647 \u0630\u062e\u06cc\u0631\u0647 \u0634\u062f.","toast.exported":"\u0628\u0627 \u0645\u0648\u0641\u0642\u06cc\u062a \u062e\u0631\u0648\u062c\u06cc \u06af\u0631\u0641\u062a\u0647 \u0634\u062f.",
    "toast.imported":"\u0628\u0627 \u0645\u0648\u0641\u0642\u06cc\u062a \u0648\u0627\u0631\u062f \u0634\u062f.","toast.copied":"\u062f\u0631 \u06a9\u0644\u06cc\u067e\u0628\u0648\u0631\u062f \u06a9\u067e\u06cc \u0634\u062f.",
    "toast.deleted":"\u062d\u0630\u0641 \u0634\u062f.","toast.soundOn":"\u0635\u062f\u0627\u06cc \u0627\u0639\u0644\u0627\u0646 \u0631\u0648\u0634\u0646",
    "toast.soundOff":"\u0635\u062f\u0627\u06cc \u0627\u0639\u0644\u0627\u0646 \u062e\u0627\u0645\u0648\u0634","toast.checksPass":"\u0647\u0645\u0647 \u0628\u0631\u0631\u0633\u06cc\u200c\u0647\u0627 \u0642\u0628\u0648\u0644 \u0634\u062f!",
    "toast.langChanged":"\u0632\u0628\u0627\u0646 \u0628\u0647 %s \u062a\u063a\u06cc\u06cc\u0631 \u06cc\u0627\u0641\u062a",
    "empty.noItems":"\u0647\u0646\u0648\u0632 \u0645\u0648\u0631\u062f\u06cc \u0646\u06cc\u0633\u062a. \u0628\u0647 \u0645\u063a\u0632 \u067e\u0631\u0648\u0698\u0647 \u0628\u0631\u0648\u06cc\u062f\u060c \u062a\u0648\u0636\u06cc\u062d\u0627\u062a \u067e\u0631\u0648\u0698\u0647 \u0631\u0627 \u0628\u0627\u0631\u06af\u0630\u0627\u0631\u06cc \u06a9\u0646\u06cc\u062f \u0648 \u062a\u062d\u0644\u06cc\u0644 \u0631\u0627 \u0628\u0632\u0646\u06cc\u062f.",
    "empty.goToBrain":"\u0631\u0641\u062a\u0646 \u0628\u0647 \u0645\u063a\u0632 \u067e\u0631\u0648\u0698\u0647",
    "auth.signIn":"\u0648\u0631\u0648\u062f","auth.register":"\u062b\u0628\u062a \u0646\u0627\u0645","auth.createAccount":"\u0627\u06cc\u062c\u0627\u062f \u062d\u0633\u0627\u0628",
    "auth.email":"\u0627\u06cc\u0645\u06cc\u0644","auth.password":"\u0631\u0645\u0632 \u0639\u0628\u0648\u0631","auth.displayName":"\u0646\u0627\u0645 \u0646\u0645\u0627\u06cc\u0634\u06cc",
    "auth.noAccount":"\u062d\u0633\u0627\u0628 \u0646\u062f\u0627\u0631\u06cc\u062f\u061f","auth.hasAccount":"\u0642\u0628\u0644\u0627 \u062d\u0633\u0627\u0628 \u062f\u0627\u0631\u06cc\u062f\u061f",
    "auth.backToLogin":"\u0628\u0627\u0632\u06af\u0634\u062a \u0628\u0647 \u0648\u0631\u0648\u062f","auth.mfaPrompt":"\u06a9\u062f \u06f6 \u0631\u0642\u0645\u06cc \u0627\u062d\u0631\u0627\u0632 \u0647\u0648\u06cc\u062a \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f",
    "auth.totpCode":"\u06a9\u062f TOTP","auth.recoveryCode":"\u06a9\u062f \u0628\u0627\u0632\u06cc\u0627\u0628\u06cc","auth.verify":"\u062a\u0627\u06cc\u06cc\u062f",
    "auth.useRecovery":"\u0627\u0633\u062a\u0641\u0627\u062f\u0647 \u0627\u0632 \u06a9\u062f \u0628\u0627\u0632\u06cc\u0627\u0628\u06cc","auth.useTotp":"\u0627\u0633\u062a\u0641\u0627\u062f\u0647 \u0627\u0632 \u0627\u067e\u0644\u06cc\u06a9\u06cc\u0634\u0646",
    "auth.joinTeam":"\u067e\u06cc\u0648\u0633\u062a\u0646 \u0628\u0647 \u062a\u06cc\u0645","auth.inviteDesc":"\u0634\u0645\u0627 \u0628\u0647 \u06cc\u06a9 \u062a\u06cc\u0645 \u062f\u0639\u0648\u062a \u0634\u062f\u0647\u200c\u0627\u06cc\u062f. \u0628\u0631\u0627\u06cc \u0634\u0631\u0648\u0639 \u062d\u0633\u0627\u0628 \u062e\u0648\u062f \u0631\u0627 \u0628\u0633\u0627\u0632\u06cc\u062f.",
    "auth.minChars":"\u062d\u062f\u0627\u0642\u0644 %s \u06a9\u0627\u0631\u0627\u06a9\u062a\u0631","auth.joinTeamBtn":"\u067e\u06cc\u0648\u0633\u062a\u0646 \u0628\u0647 \u062a\u06cc\u0645",
    "label.search":"\u062c\u0633\u062a\u062c\u0648 \u062f\u0631 \u0647\u0645\u0647 \u0645\u0648\u0627\u0631\u062f...","label.focusMode":"\u062d\u0627\u0644\u062a \u062a\u0645\u0631\u06a9\u0632",
    "label.darkMode":"\u062d\u0627\u0644\u062a \u062a\u0627\u0631\u06cc\u06a9","label.runChecks":"\u0627\u062c\u0631\u0627\u06cc \u0628\u0631\u0631\u0633\u06cc\u200c\u0647\u0627",
    "label.help":"\u0645\u06cc\u0627\u0646\u0628\u0631\u0647\u0627\u06cc \u0635\u0641\u062d\u0647 \u06a9\u0644\u06cc\u062f","label.language":"\u0632\u0628\u0627\u0646",
    "label.savedHint":"\u0630\u062e\u06cc\u0631\u0647 \u062e\u0648\u062f\u06a9\u0627\u0631 \u0645\u062d\u0644\u06cc","label.session":"\u062c\u0644\u0633\u0647: %s\u062f\u0642\u06cc\u0642\u0647",
    "label.collapse":"\u0628\u0633\u062a\u0646 \u0646\u0648\u0627\u0631 \u06a9\u0646\u0627\u0631\u06cc","label.switchProject":"\u062a\u063a\u06cc\u06cc\u0631 \u067e\u0631\u0648\u0698\u0647",
    "nav.previous":"\u0642\u0628\u0644\u06cc","nav.next":"\u0628\u0639\u062f\u06cc",
    "guide.title":"\u067e\u06cc\u0634\u0646\u0647\u0627\u062f \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06cc:","guide.goTo":"\u0628\u0631\u0648 \u0628\u0647",
    "guide.start":"\u0627\u0632 \u0627\u06cc\u0646\u062c\u0627 \u0634\u0631\u0648\u0639 \u06a9\u0646\u06cc\u062f \u2014 \u062a\u0648\u0636\u06cc\u062d\u0627\u062a \u067e\u0631\u0648\u0698\u0647 \u0631\u0627 \u0628\u0627\u0631\u06af\u0630\u0627\u0631\u06cc \u06a9\u0646\u06cc\u062f \u062a\u0627 \u0628\u0631\u0646\u0627\u0645\u0647 \u06a9\u0627\u0645\u0644 \u0633\u0627\u062e\u062a\u0647 \u0634\u0648\u062f.",
    "guide.advisor":"\u0627\u0648\u0644\u0648\u06cc\u062a\u200c\u0647\u0627\u06cc \u0627\u0635\u0644\u06cc \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06cc \u0631\u0627 \u0628\u0628\u06cc\u0646\u06cc\u062f \u2014 \u0627\u0628\u062a\u062f\u0627 \u0686\u0647 \u06a9\u0627\u0631\u06cc \u0627\u0646\u062c\u0627\u0645 \u062f\u0647\u06cc\u062f.",
    "guide.blocked":"\u0645\u0648\u0631\u062f \u0645\u0633\u062f\u0648\u062f \u0634\u062f\u0647 \u0627\u0633\u062a \u2014 \u0627\u0628\u062a\u062f\u0627 \u0622\u0646\u200c\u0647\u0627 \u0631\u0627 \u0631\u0641\u0639 \u06a9\u0646\u06cc\u062f.",
    "guide.critical":"\u0631\u06cc\u0633\u06a9 \u0628\u062d\u0631\u0627\u0646\u06cc \u0628\u0647 \u0645\u0633\u0626\u0648\u0644 \u0648 \u0628\u0631\u0646\u0627\u0645\u0647 \u06a9\u0627\u0647\u0634 \u0646\u06cc\u0627\u0632 \u062f\u0627\u0631\u062f.",
    "guide.market":"\u062a\u0635\u0645\u06cc\u0645 \u0628\u06af\u06cc\u0631\u06cc\u062f \u0627\u0628\u062a\u062f\u0627 \u0628\u0647 \u06a9\u062f\u0627\u0645 \u06a9\u0634\u0648\u0631\u0647\u0627 \u0648\u0627\u0631\u062f \u0634\u0648\u06cc\u062f.",
    "guide.licensing":"\u0645\u062c\u0648\u0632\u0647\u0627\u06cc \u06a9\u0646\u062f \u0631\u0627 \u0627\u0644\u0627\u0646 \u0634\u0631\u0648\u0639 \u06a9\u0646\u06cc\u062f \u2014 \u0622\u0646\u200c\u0647\u0627 \u0632\u0645\u0627\u0646\u200c\u0628\u0646\u062f\u06cc \u0634\u0645\u0627 \u0631\u0627 \u062a\u0639\u06cc\u06cc\u0646 \u0645\u06cc\u200c\u06a9\u0646\u0646\u062f.",
    "guide.timeline":"\u0645\u06cc\u0644\u0647\u200c\u0647\u0627 \u0648 \u062a\u0627\u0631\u06cc\u062e\u200c\u0647\u0627\u06cc \u0647\u062f\u0641 \u0631\u0627 \u0628\u0631\u0631\u0633\u06cc \u06a9\u0646\u06cc\u062f.",
    "guide.globe":"\u0645\u0633\u06cc\u0631 \u0648 \u067e\u06cc\u0634\u0631\u0641\u062a \u0631\u0627 \u0631\u0648\u06cc \u0646\u0642\u0634\u0647 \u0633\u0647\u200c\u0628\u0639\u062f\u06cc \u0628\u0628\u06cc\u0646\u06cc\u062f.",
    "guide.brief":"\u0622\u0646 \u0631\u0627 \u0628\u0631\u0627\u06cc \u0633\u0631\u0645\u0627\u06cc\u0647\u200c\u06af\u0630\u0627\u0631\u0627\u0646 \u0648 \u0645\u0642\u0627\u0645\u0627\u062a \u062f\u0648\u0644\u062a\u06cc \u0622\u0645\u0627\u062f\u0647 \u06a9\u0646\u06cc\u062f."
  };

  // --- API ---
  var _lang = "en";
  try { _lang = localStorage.getItem("qi_lang") || "en"; } catch(e) {}
  if (!DICT[_lang]) _lang = "en";

  function t(key) {
    var dict = DICT[_lang] || DICT.en;
    var str = dict[key] != null ? dict[key] : (DICT.en[key] != null ? DICT.en[key] : key);
    if (arguments.length > 1) {
      for (var i = 1; i < arguments.length; i++) {
        str = str.replace("%s", arguments[i]);
      }
    }
    return str;
  }

  function getLang() { return _lang; }

  function setLang(code) {
    if (!DICT[code]) return;
    _lang = code;
    try { localStorage.setItem("qi_lang", code); } catch(e) {}
  }

  function isRTL() { return _lang === "fa"; }

  window.QII18n = {
    t: t,
    getLang: getLang,
    setLang: setLang,
    isRTL: isRTL,
    LANGS: LANGS,
    DICT: DICT
  };

})();
