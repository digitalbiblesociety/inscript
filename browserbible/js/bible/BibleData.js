// Rows: [id, name, sortOrder, usfm, sectionIndex, chapters, names]. name 0 = same as
// names[0]; sectionIndex -1 = none; chapters integer N = N chapters, counts unknown.
const SECTIONS = ["penta","hist","poet","majorp","minorp","gospel","acts","paul","general","rev"];

const UNKNOWN = new Map();
const unknownChapters = (n) => {
  let a = UNKNOWN.get(n);
  if (!a) UNKNOWN.set(n, a = Object.freeze(new Array(n).fill(null)));
  return a;
};

export const BOOK_DATA = {};

const BY_SORT_ORDER = new Map();

for (const [id, name, sortOrder, usfm, section, chapters, names] of JSON.parse(`[["FR",0,0,"FRT",-1,1,["Front matter"]],["IN",0,1,"INT",-1,1,["Introduction"]],["GN",0,2,"GEN",0,[31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],["Genesis","Ge","Gen"]],["EX",0,3,"EXO",0,[22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],["Exodus","Ex","Exo"]],["LV",0,4,"LEV",0,[17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34],["Leviticus","Le","Lev"]],["NU",0,5,"NUM",0,[54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],["Numbers","Nu","Num"]],["DT",0,6,"DEU",0,[46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],["Deuteronomy","Dt","Deut","Deu","De"]],["JS",0,7,"JOS",1,[18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],["Joshua","Js","Jos","Josh"]],["JG",0,8,"JDG",1,[36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],["Judges","Jg","Jdg","Jdgs"]],["RT",0,9,"RUT",1,[22,23,18,22],["Ruth","Ru","Rut"]],["S1","The First Book of Samuel",10,"1SA",1,[28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13],["1 Samuel","1S","1 Sam","1Sam","1 Sa","1Sa","I Samuel","I Sam","I Sa"]],["S2","The Second Book of Samuel",11,"2SA",1,[27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],["2 Samuel","2S","2 Sam","2Sam","2 Sa","2Sa","II Samuel","II Sam","II Sa","IIS"]],["K1","The First Book of Kings",12,"1KI",1,[53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],["1 Kings","1K","1 Kin","1Kin","1 Ki","IK","1Ki","I Kings","I Kin","I Ki"]],["K2","The Second Book of Kings",13,"2KI",1,[18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30],["2 Kings","2K","2 Kin","2Kin","2 Ki","IIK","2Ki","II Kings","II Kin","II Ki"]],["R1","The First Book of Chronicles",14,"1CH",1,[54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30],["1 Chronicles","1Ch","1 Chr","1Chr","1 Ch","ICh","I Chronicles","I Chr","I Ch"]],["R2","The Second Book of Chronicles",15,"2CH",1,[17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23],["2 Chronicles","2Ch","2 Chr","2Chr","2 Ch","IICh","II Chronicles","II Chr","II Ch"]],["ER",0,16,"EZR",1,[11,70,13,24,17,22,28,36,15,44],["Ezra","Ezr"]],["NH",0,17,"NEH",1,[11,20,32,23,19,19,73,18,38,39,36,47,31],["Nehemiah","Ne","Neh"]],["ET",0,18,"EST",1,[22,23,15,17,14,14,10,17,32,3],["Esther","Es","Est","Esth"]],["JB",0,19,"JOB",2,[22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17],["Job","Jb"]],["PS","Psalms",20,"PSA",2,[6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6],["Psalm","Ps","Psa"]],["PR",0,21,"PRO",2,[33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31],["Proverbs","Pr","Prov","Pro"]],["EC",0,22,"ECC",2,[18,26,22,16,20,12,29,17,18,20,10,14],["Ecclesiastes","Ec","Ecc","Qohelet"]],["SS","Song of Solomon",23,"SNG",2,[17,17,11,16,16,13,13,14],["Song of Songs","So","Sos","Song of Solomon","SOS","SongOfSongs","SongofSolomon","Canticle of Canticles"]],["IS",0,24,"ISA",3,[31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24],["Isaiah","Is","Isa"]],["JR",0,25,"JER",3,[19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34],["Jeremiah","Je","Jer"]],["LM",0,26,"LAM",2,[22,22,66,22,22],["Lamentations","La","Lam","Lament"]],["EK",0,27,"EZK",3,[28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35],["Ezekiel","Ek","Ezek","Eze"]],["DN",0,28,"DAN",3,[21,49,30,37,31,28,28,27,27,21,45,13],["Daniel","Da","Dan","Dl","Dnl"]],["HS",0,29,"HOS",4,[11,23,5,19,15,11,16,14,17,15,12,14,16,9],["Hosea","Ho","Hos"]],["JL",0,30,"JOL",4,[20,32,21],["Joel","Jl","Joe"]],["AM",0,31,"AMO",4,[15,16,15,13,27,14,17,14,15],["Amos","Am","Amo"]],["OB",0,32,"OBA",4,[21],["Obadiah","Ob","Oba","Obd","Odbh"]],["JH",0,33,"JON",4,[17,10,10,11],["Jonah","Jh","Jon","Jnh"]],["MC",0,34,"MIC",4,[16,13,12,13,15,16,20],["Micah","Mi","Mic"]],["NM",0,35,"NAM",4,[15,13,19],["Nahum","Na","Nah"]],["HK",0,36,"HAB",4,[17,20,19],["Habakkuk","Hb","Hab","Hk","Habk"]],["ZP",0,37,"ZEP",4,[18,15,20],["Zephaniah","Zp","Zep","Zeph"]],["HG",0,38,"HAG",4,[15,23],["Haggai","Ha","Hag","Hagg"]],["ZC",0,39,"ZEC",4,[21,13,10,14,11,15,14,23,17,12,17,14,9,21],["Zechariah","Zc","Zech","Zec"]],["ML",0,40,"MAL",4,[14,17,18,6],["Malachi","Ml","Mal","Mlc"]],["TB",0,41,"TOB",-1,[22,14,17,21,22,17,18],["Tobit"]],["JT",0,42,"JDT",-1,[16,28,10,15,24,21,32,36,14,23,23,20,20,19,13,25],["Judith"]],["EG",0,43,"ESG",-1,16,["Esther (Greek)"]],["AE",0,44,"ADE",-1,[],["Additions to Esther"]],["WS","Wisdom of Solomon",45,"WIS",-1,[],["Wisdom","Wisdom of Solomon"]],["SR",0,46,"SIR",-1,[],["Sirach","Ecclesiasticus"]],["BR",0,47,"BAR",-1,[],["Baruch"]],["LJ",0,48,"LJE",-1,[],["Letter of Jeremiah"]],["PA","Song of the Three Children",49,"S3Y",-1,[],["Prayer of Azariah"]],["SN",0,50,"SUS",-1,[],["Susanna"]],["BL",0,51,"BEL",-1,[],["Bel and the Dragon"]],["M1",0,52,"1MA",-1,[],["1 Maccabees"]],["M2",0,53,"2MA",-1,[],["2 Maccabees"]],["E1",0,54,"1ES",-1,[],["1 Esdras"]],["PX",0,56,"PS2",-1,1,["Psalm 151"]],["PN",0,55,"MAN",-1,1,["Prayer of Manasseh"]],["M3",0,57,"3MA",-1,[],["3 Maccabees"]],["E2",0,58,"2ES",-1,[],["2 Esdras","5 Ezra"]],["M4",0,59,"4MA",-1,[],["4 Maccabees"]],["OS",0,60,"ODS",-1,[],["Odes of Solomon"]],["SP",0,61,"PSS",-1,[],["Psalms of Solomon"]],["LL",0,62,"LAO",-1,[],["Epistle to the Laodiceans"]],["N1",0,63,"ENO",-1,[],["Enoch","1 Enoch"]],["JE",0,64,"JUB",-1,[],["Jubilees"]],["AD",0,65,"DNT",-1,14,["Additions to Daniel"]],["DG",0,66,"DAG",-1,12,["Daniel (Greek)"]],["OA",0,110,"ODA",-1,[],["Odes","Odae"]],["EA",0,111,"EZA",-1,[],["Ezra Apocalypse"]],["E5",0,112,"5EZ",-1,[],["5 Ezra"]],["E6",0,113,"6EZ",-1,[],["6 Ezra"]],["P3",0,114,"PS3",-1,[],["Psalms 152-155"]],["B2","2 Baruch (Apocalypse)",115,"2BA",-1,[],["2 Baruch","2 Baruch (Apocalypse)"]],["LB",0,116,"LBA",-1,[],["Letter of Baruch"]],["Q1",0,117,"1MQ",-1,[],["1 Meqabyan","1 Mekabis"]],["Q2",0,118,"2MQ",-1,[],["2 Meqabyan","2 Mekabis"]],["Q3",0,119,"3MQ",-1,[],["3 Meqabyan"]],["RP",0,120,"REP",-1,[],["Reproof"]],["B4",0,121,"4BA",-1,[],["4 Baruch","Paralipomenon of Jeremiah"]],["MT",0,70,"MAT",5,[25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20],["Matthew","Mt","Matt","Mat"]],["MK",0,71,"MRK",5,[45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20],["Mark","Mk","Mar","Mrk"]],["LK",0,72,"LUK",5,[80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53],["Luke","Lk","Luk","Lu"]],["JN",0,73,"JHN",5,[51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25],["John","Jn","Joh","Jo"]],["AC",0,74,"ACT",6,[26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31],["Acts","Ac","Act"]],["RM",0,75,"ROM",7,[32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27],["Romans","Ro","Rom","Rmn","Rmns"]],["C1","Paul's First Letter to the Corinthians",76,"1CO",7,[31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24],["1 Corinthians","1Co","1 Cor","1Cor","ICo","1 Co","I Corinthians","I Cor","I Co"]],["C2","Paul's Second Lettor to the Corinthians",77,"2CO",7,[24,17,18,18,21,18,16,24,15,18,33,21,14],["2 Corinthians","2Co","2 Cor","2Cor","IICo","2 Co","II Corinthians","II Cor","II Co"]],["GL","Paul's Letter to the Galatians",78,"GAL",7,[24,21,29,31,26,18],["Galatians","Ga","Gal","Gltns"]],["EP","Paul's Letter to the Ephesians",79,"EPH",7,[23,22,21,32,33,24],["Ephesians","Ep","Eph","Ephn"]],["PP","Paul's Letter to the Philippians",80,"PHP",7,[30,30,21,23],["Philippians","Pp","Phi","Phil"]],["CL","Paul's Letter to the Colossians",81,"COL",7,[29,23,25,18],["Colossians","Co","Col","Colo","Cln","Clns"]],["H1","Paul's First Letter to the Thessalonians",82,"1TH",7,[10,20,13,18,28],["1 Thessalonians","1Th","1 Thess","1Thess","ITh","1 Thes","1Thes","1 The","1The","1 Th","I Thessalonians","I Thess","I The","I Th"]],["H2","Paul's Second Letter to the Thessalonians",83,"2TH",7,[12,17,18],["2 Thessalonians","2Th","2 Thess","2Thess","IITh","2 Thes","2Thes","2 The","2The","2 Th","II Thessalonians","II Thess","II The","II Th"]],["T1","Paul's First Letter to Timothy",84,"1TI",7,[20,15,16,16,25,21],["1 Timothy","1Ti","1 Tim","1Tim","1 Ti","ITi","I Timothy","I Tim","I Ti"]],["T2","Paul's Second Letter to Timothy",85,"2TI",7,[18,26,17,22],["2 Timothy","2Ti","2 Tim","2Tim","2 Ti","IITi","II Timothy","II Tim","II Ti"]],["TT","Paul's Letter to Titus",86,"TIT",7,[16,15,15],["Titus","Ti","Tit","Tt","Ts"]],["PM","Paul's Letter to Philemon",87,"PHM",7,[25],["Philemon","Pm","Phile","Philm"]],["HB","The Letter to the Hebrews",88,"HEB",8,[14,18,19,16,14,20,28,13,28,39,40,29,25],["Hebrews","He","Heb","Hw"]],["JM","The Letter from James",89,"JAS",8,[27,26,18,17,20],["James","Jm","Jam","Jas","Ja"]],["P1","The First Letter from Peter",90,"1PE",8,[25,25,22,19,14],["1 Peter","1P","1 Pet","1Pet","IPe","I Peter","I Pet","I Pe"]],["P2","The Second Letter from Peter",91,"2PE",8,[21,22,18],["2 Peter","2P","2 Pet","2Pet","2Pe","IIP","II Peter","II Pet","II Pe"]],["J1","John's First Letter",92,"1JN",8,[10,29,24,21,21],["1 John","1J","1 Jn","1Jn","1 Jo","IJo","I John","I Jo","I Jn"]],["J2","John's Second Letter",93,"2JN",8,[13],["2 John","2J","2 Jn","2Jn","2 Jo","IIJo","II John","II Jo","II Jn"]],["J3","John's Third Letter",94,"3JN",8,[14],["3 John","3J","3 Jn","3Jn","3 Jo","IIIJo","III John","III Jo","III Jn"]],["JD","Jude's Letter",95,"JUD",8,[25],["Jude"]],["RV","The Revelation to John",96,"REV",9,[20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,20],["Revelation","Re","Rev","Rvltn"]],["BK",0,97,"BAK",-1,1,["Back matter"]],["OH",0,98,"OTH",-1,1,["Other"]],["XA",0,99,"XXA",-1,151,["XXA"]],["XB",0,100,"XXB",-1,151,["XXB"]],["XC",0,101,"XXC",-1,151,["XXC"]],["XD",0,102,"XXD",-1,151,["XXD"]],["XE",0,103,"XXE",-1,151,["XXE"]],["XF",0,104,"XXF",-1,151,["XXF"]],["XG",0,105,"XXG",-1,151,["XXG"]],["GS",0,106,"GLO",-1,1,["Glossary"]],["CN",0,107,"CNC",-1,1,["Concordance"]],["TX",0,108,"TDX",-1,1,["Topical Index"]],["NX",0,109,"NDX",-1,1,["Names Index"]]]`)) {
  const book = { name: name || names[0], sortOrder, usfm };
  if (section >= 0) book.section = SECTIONS[section];
  book.chapters = typeof chapters === 'number' ? unknownChapters(chapters) : chapters;
  book.names = { eng: names };
  BOOK_DATA[id] = book;
  BY_SORT_ORDER.set(sortOrder, book);
}

export const EXTRA_MATTER = ["FR","IN","BK","OH","XA","XB","XC","XD","XE","XF","XG","GS","CN","TX","NX"];

export const OT_BOOKS_USFM = ["GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI","1CH","2CH","EZR","NEH","EST","JOB","PSA","PRO","ECC","SNG","ISA","JER","LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP","HAG","ZEC","MAL"];
export const OT_BOOKS = ["GN","EX","LV","NU","DT","JS","JG","RT","S1","S2","K1","K2","R1","R2","ER","NH","ET","JB","PS","PR","EC","SS","IS","JR","LM","EK","DN","HS","JL","AM","OB","JH","MC","NM","HK","ZP","HG","ZC","ML"];

export const NT_BOOKS_USFM = ["MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL","EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAS","1PE","2PE","1JN","2JN","3JN","JUD","REV"];
export const NT_BOOKS = ["MT","MK","LK","JN","AC","RM","C1","C2","GL","EP","PP","CL","H1","H2","T1","T2","TT","PM","HB","JM","P1","P2","J1","J2","J3","JD","RV"];

export const AP_BOOKS_USFM = ["TOB","JDT","ESG","WIS","SIR","BAR","LJE","S3Y","SUS","BEL","1MA","2MA","3MA","4MA","1ES","2ES","MAN","PS2","ODA","PSS","EZA","5EZ","6EZ","DAG","PS3","2BA","LBA","JUB","ENO","1MQ","2MQ","3MQ","REP","4BA","LAO"];
export const AP_BOOKS      = ["TB","JT","EG","WS","SR","BR","LJ","PA","SN","BL","M1","M2","M3","M4","E1","E2","PN","PX","OA","SP","EA","E5","E6","DG","P3","B2","LB","JE","N1","Q1","Q2","Q3","RP","B4","LL"];

export const DEFAULT_BIBLE = [...OT_BOOKS, ...NT_BOOKS];
export const DEFAULT_BIBLE_USFM = [...OT_BOOKS_USFM, ...NT_BOOKS_USFM];

export const APOCRYPHAL_BIBLE = [...OT_BOOKS, ...AP_BOOKS, ...NT_BOOKS];
export const APOCRYPHAL_BIBLE_USFM = [...OT_BOOKS_USFM, ...AP_BOOKS_USFM, ...NT_BOOKS_USFM];

export const numbers = {
  default: Array.from({ length: 151 }, (_, i) => String(i))
};

/**
 * `bookList` and `namesData` are positionally aligned.
 */
export function addNames(lang, bookList, namesData) {
  for (const [i, dbsCode] of bookList.entries()) {
    const bookInfo = BOOK_DATA[dbsCode];
    let names = namesData[i];

    if (bookInfo) {
      if (typeof names === 'string') {
        names = [names];
      }

      if (!bookInfo.names[lang]) {
        bookInfo.names[lang] = [];
      }

      bookInfo.names[lang].splice(bookInfo.names[lang].length - 1, 0, names);
    }
  }
}

export const getBookInfo = (bookid) => BOOK_DATA[bookid] ?? null;

export const getBookByIndex = (index) => BY_SORT_ORDER.get(index) ?? null;

/** Returns -1 when the book is unknown. */
export const getBookIndex = (bookid) => BOOK_DATA[bookid]?.sortOrder ?? -1;

export const getChapterCount = (bookid) => BOOK_DATA[bookid]?.chapters?.length ?? 0;

/** `chapter` is 1-based. */
export const getVerseCount = (bookid, chapter) => {
  const book = BOOK_DATA[bookid];
  if (book?.chapters && chapter > 0 && chapter <= book.chapters.length) {
    return book.chapters[chapter - 1] ?? 0;
  }
  return 0;
};

const bible = {
  BOOK_DATA,
  EXTRA_MATTER,
  OT_BOOKS_USFM,
  OT_BOOKS,
  NT_BOOKS_USFM,
  NT_BOOKS,
  AP_BOOKS_USFM,
  AP_BOOKS,
  DEFAULT_BIBLE,
  DEFAULT_BIBLE_USFM,
  APOCRYPHAL_BIBLE,
  APOCRYPHAL_BIBLE_USFM,
  numbers,
  addNames,
  getBookInfo,
  getBookByIndex,
  getBookIndex,
  getChapterCount,
  getVerseCount
};

export default bible;
