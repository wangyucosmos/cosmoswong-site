// 字母、发音难点、自然拼读 7 课
const LETTERS = [
 ["A","apple","/æ/"],["B","ball","/b/"],["C","cat","/k/"],["D","dog","/d/"],["E","egg","/e/"],["F","fish","/f/"],
 ["G","girl","/ɡ/"],["H","hat","/h/"],["I","pig","/ɪ/"],["J","jam","/dʒ/"],["K","kite","/k/"],["L","leg","/l/"],
 ["M","milk","/m/"],["N","nose","/n/"],["O","hot","/ɑː/"],["P","pen","/p/"],["Q","queen","/kw/"],["R","red","/r/"],
 ["S","sun","/s/"],["T","ten","/t/"],["U","cup","/ʌ/"],["V","van","/v/"],["W","water","/w/"],["X","box","/ks/"],
 ["Y","yes","/j/"],["Z","zoo","/z/"]
];

const HARD_SOUNDS = [
 {s:"θ", tip:"舌尖放在上下牙之间轻轻吹气，不是 s", w:["think","three","thank"]},
 {s:"ð", tip:"同上，但声带振动，不是 z 或 d", w:["this","that","mother"]},
 {s:"v", tip:"上牙轻咬下唇再发声，不是 w", w:["very","love","five"]},
 {s:"w", tip:"嘴唇圆起来往前推，牙齿不碰嘴唇", w:["we","water","window"]},
 {s:"r", tip:"舌尖向后卷但不碰上颚，嘴唇微圆", w:["red","right","room"]},
 {s:"l", tip:"词尾的 l 舌尖要顶住上牙龈，别吞掉", w:["love","milk","school"]},
 {s:"æ", tip:"嘴巴张大，像「哎」和「啊」之间", w:["cat","bad","apple"]},
 {s:"iː / ɪ", tip:"长音 ee 拉长、嘴角咧开；短音 i 短而放松", w:["sheep","ship","eat","it"]},
 {s:"词尾辅音", tip:"中文没有，容易加尾巴：book 不要读成 book-e", w:["book","bed","bag","cake"]}
];

// 自然拼读：units 每项 "字母|音标|例词,例词|提示"；blends 每项 "字母/音 字母/音"（音为 - 表示不发音）；quiz 每组是容易混的词
const PHONICS = [
 {t:"字母的声音", sum:"26 个字母在单词里发什么音",
  rule:"每个字母都有「名字」和「声音」。A 的名字读 /eɪ/，但在 cat 里发 /æ/。拼读靠的是<b>声音</b>。<br>5 个元音字母 <b>a e i o u</b> 最关键，其余 21 个是辅音。先把每个字母的声音和一个例词绑在一起记。",
  units:["a|æ|apple,cat|元音","b|b|bag,bed","c|k|cat,cup|在 e / i / y 前常读 /s/：city","d|d|dog,dad","e|e|egg,bed|元音","f|f|fish,fan","g|ɡ|go,bag|在 e / i 前有时读 /dʒ/：gym","h|h|hat,hot","i|ɪ|it,pig|元音","j|dʒ|jam,job","k|k|kid,kit","l|l|leg,lip","m|m|map,mom","n|n|net,nut","o|ɑː|hot,box|元音（美式发音）","p|p|pen,pig","qu|kw|queen,quick|q 后面几乎总跟着 u","r|r|red,run","s|s|sun,sit","t|t|ten,top","u|ʌ|up,cup|元音","v|v|van,vet|上牙咬下唇","w|w|wet,win|嘴唇圆起来","x|ks|box,six","y|j|yes,yet","z|z|zoo,zip"],
  blends:[],
  quiz:[["bat","pat","mat","hat"],["dog","log","fog","hog"],["van","fan","man","pan"],["red","bed","led","fed"],["sun","bun","fun","run"],["wet","vet","net","jet"],["kit","sit","hit","fit"],["map","cap","tap","nap"]]},
 {t:"短元音和拼读", sum:"cat, bed, pig, hot, cup",
  rule:"一个元音被辅音夹在中间（辅音 + 元音 + 辅音），元音通常读<b>短音</b>。<br>拼读的方法：先把每个音读出来，再越读越快连成一个词：<b>c — a — t → ca-t → cat</b>。",
  units:["a|æ|cat,map,bag|嘴张大，介于「哎」和「啊」之间","e|e|bed,ten,red|比汉语「哎」短","i|ɪ|pig,sit,big|短而放松，不是「衣」","o|ɑː|hot,box,stop|嘴张圆，像「啊」","u|ʌ|cup,bus,sun|短促的「阿」"],
  blends:["c/k a/æ t/t","m/m a/æ p/p","b/b e/e d/d","t/t e/e n/n","p/p i/ɪ g/ɡ","s/s i/ɪ t/t","h/h o/ɑː t/t","b/b o/ɑː x/ks","c/k u/ʌ p/p","s/s u/ʌ n/n","h/h a/æ n/n d/d","j/dʒ u/ʌ m/m p/p","s/s t/t o/ɑː p/p","f/f r/r o/ɑː g/ɡ"],
  quiz:[["cat","cot","cut","kit"],["bag","beg","big","bug"],["pen","pan","pin"],["hat","hit","hot","hut"],["ten","tin","tan"],["bad","bed","bid","bud"],["pat","pet","pit","pot"],["sat","set","sit"]]},
 {t:"辅音组合", sum:"sh, ch, th, ck, ng, wh, ph",
  rule:"两个辅音字母合在一起，发<b>一个新的音</b>，不能拆开读。比如 sh 不是 s + h，而是 /ʃ/。",
  units:["sh|ʃ|ship,fish,shop|嘴唇往前噘","ch|tʃ|chip,lunch,much","th|θ|think,three,bath|舌尖放在上下牙之间吹气，不振动","th|ð|this,that,mother|同样的位置，声带振动","ck|k|back,duck,black|一般出现在短元音后面","ng|ŋ|sing,long,ring|鼻音，结尾不要读出 g","wh|w|what,when,white","ph|f|phone,photo"],
  blends:["sh/ʃ i/ɪ p/p","f/f i/ɪ sh/ʃ","ch/tʃ i/ɪ p/p","l/l u/ʌ n/n ch/tʃ","th/θ i/ɪ n/n","b/b a/æ th/θ","th/ð i/ɪ s/s","th/ð a/æ t/t","d/d u/ʌ ck/k","b/b l/l a/æ ck/k","s/s i/ɪ ng/ŋ","l/l o/ɔː ng/ŋ","wh/w e/e n/n"],
  quiz:[["ship","chip","sip","tip"],["shop","chop","top","hop"],["think","sink","link","pink"],["three","free","tree"],["sing","sink","sin"],["thin","sin","tin","fin"],["cash","catch","cat"],["back","bag","bat"]]},
 {t:"不发音的 e", sum:"cap → cape, kit → kite",
  rule:"单词结尾的 e 自己<b>不发音</b>，但它会让前面隔一个辅音的元音读<b>字母的名字</b>。<br>规律：元音 + 辅音 + e。比如 cap /kæp/ 加上 e 变成 cape /keɪp/。",
  units:["a_e|eɪ|cake,make,name","i_e|aɪ|bike,time,five","o_e|oʊ|home,nose,note","u_e|juː|cute,use|有时读 /uː/：rule","e_e|iː|these"],
  pairs:[["cap","cape"],["kit","kite"],["hop","hope"],["cut","cute"],["tap","tape"],["pin","pine"],["not","note"],["mad","made"]],
  blends:["c/k a/eɪ k/k e/-","n/n a/eɪ m/m e/-","t/t a/eɪ p/p e/-","b/b i/aɪ k/k e/-","f/f i/aɪ v/v e/-","h/h o/oʊ m/m e/-","n/n o/oʊ s/z e/-","c/k u/juː t/t e/-"],
  quiz:[["cap","cape","cop"],["kit","kite","cat"],["hop","hope","hip"],["cut","cute","cat"],["tap","tape","top"],["pin","pine","pan"],["not","note","net"],["mad","made","mud"]]},
 {t:"元音组合", sum:"ee, ea, ai, ay, oa, oo, ou, oi",
  rule:"两个元音字母挨在一起，常常只发<b>一个音</b>。口诀：「两个元音一起走，第一个开口说名字」（ee, ea, ai, oa）。oo、ou、oi 这些组合有自己固定的音，单独记。",
  units:["ee|iː|see,tree,sheep","ea|iː|eat,tea,read|少数读 /e/：bread, head","ai|eɪ|rain,wait,train","ay|eɪ|day,play,say|多在词尾","oa|oʊ|boat,road,coat","ow|oʊ|snow,slow,window|也常读 /aʊ/：now, cow","oo|uː|food,moon,room|长音","oo|ʊ|book,look,good|短音","ou|aʊ|house,out,mouth","oi|ɔɪ|coin,oil","oy|ɔɪ|boy,toy|多在词尾"],
  blends:["sh/ʃ ee/iː p/p","t/t r/r ee/iː","t/t ea/iː","r/r ai/eɪ n/n","d/d ay/eɪ","b/b oa/oʊ t/t","s/s n/n ow/oʊ","m/m oo/uː n/n","b/b oo/ʊ k/k","h/h ou/aʊ s/s e/-","c/k oi/ɔɪ n/n","b/b oy/ɔɪ"],
  quiz:[["sheep","ship","shape"],["feet","fit","fat"],["rain","ran","run"],["boat","bat","but"],["pool","pull","pal"],["beat","bit","bet"],["meet","met","mat"],["coin","cone","can"],["road","rod","red"]]},
 {t:"带 r 的元音", sum:"ar, or, er, ir, ur, air, ear",
  rule:"元音后面跟着 r，元音的音会改变。美式英语里 r 要卷舌读出来。<b>er、ir、ur 三个读音一样</b>，都是 /ɜːr/，只能靠多见记拼写。",
  units:["ar|ɑːr|car,park,star","or|ɔːr|for,fork,short","er|ɜːr|her|在词尾常弱读成 /ər/：teacher","ir|ɜːr|girl,bird,first","ur|ɜːr|turn,nurse,hurt","air|er|hair,chair","ear|ɪr|ear,hear,near"],
  blends:["c/k ar/ɑːr","p/p ar/ɑːr k/k","f/f or/ɔːr k/k","sh/ʃ or/ɔːr t/t","h/h er/ɜːr","g/ɡ ir/ɜːr l/l","b/b ir/ɜːr d/d","t/t ur/ɜːr n/n","ch/tʃ air/er","h/h ear/ɪr"],
  quiz:[["far","for","fur"],["farm","form","firm"],["park","pork","perk"],["bird","bad","bud"],["hurt","heart","hot"],["star","store","stir"],["hair","here","her"],["shark","short","shirt"]]},
 {t:"不守规律的高频词", sum:"the, said, was, one, two…",
  rule:"有一些最常用的词不按规律读，叫<b>高频词</b>（也叫视觉词）。它们数量不多，而且天天见，直接整体记住就行。注意每个词「不守规律」的那一部分。",
  units:["the|ðə|the|在元音前读 /ði/：the apple","said|sed|said|不读 /seɪd/","was|wʌz|was|a 读 /ʌ/","of|ʌv|of|f 读 /v/","one|wʌn|one|开头有个 /w/ 音","two|tuː|two|w 不发音","do|duː|do|o 读 /uː/","come|kʌm|come|o 读 /ʌ/","some|sʌm|some|和 come 一样","have|hæv|have|e 不让 a 变长","give|ɡɪv|give|e 不让 i 变长","they|ðeɪ|they|ey 读 /eɪ/","who|huː|who|w 不发音","friend|frend|friend|i 不发音","people|ˈpiːpl|people|eo 读 /iː/","does|dʌz|does|oe 读 /ʌ/"],
  blends:[],
  quiz:[["said","sad","seed"],["come","came","cam"],["give","gave","five"],["have","hive","half"],["they","the","then"],["where","were","what"],["who","how","hot"],["friend","find","fried"],["people","purple","pupil"],["does","dose","dogs"]]}
];
const PH_PASS = 6, PH_N = 8;
const parseB = s => s.split(" ").map(x=>{ const j=x.indexOf("/"); return [x.slice(0,j), x.slice(j+1)]; });
// phDoneN / phNext 在 app.js 里定义
// = () => PHONICS.filter((_,i)=>S.phonics[i] && S.phonics[i].done).length;
// = () => PHONICS.findIndex((_,i)=>!(S.phonics[i] && S.phonics[i].done));

