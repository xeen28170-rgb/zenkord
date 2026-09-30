/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

export const REACT_GLOBAL = "Vencord.Webpack.Common.React";

// Equicord
export const SUPPORT_CHANNEL_ID = "1297590739911573585";
export const GUILD_ID = "1173279886065029291";
export const DONOR_ROLE_ID = "1173316879083896912";
export const CONTRIB_ROLE_ID = "1222677964760682556";
export const EQUICORD_TEAM = "1173520023239786538";
export const EQUICORD_HELPERS = "1326406112144265257";
export const VENCORD_CONTRIB_ROLE_ID = "1173343399470964856";
export const EQUIBOT_USER_ID = "1243063117852835941";
export const ZENKORD_BOT_USER_ID = "1485437232902049973";

// Vencord
export const VC_SUPPORT_CHANNEL_ID = "1026515880080842772";
export const VC_GUILD_ID = "1015060230222131221";
export const VENBOT_USER_ID = "1017176847865352332";
export const VC_DONOR_ROLE_ID = "1042507929485586532";
export const VC_CONTRIB_ROLE_ID = "1026534353167208489";
export const VC_REGULAR_ROLE_ID = "1026504932959977532";
export const VC_SUPPORT_CATEGORY_ID = "1108135649699180705";
export const VC_KNOWN_ISSUES_CHANNEL_ID = "1222936386626129920";
export const VESKTOP_SUPPORT_CHANNEL_ID = "1345457031426871417";
export const VC_SUPPORT_CHANNEL_IDS = [VC_SUPPORT_CHANNEL_ID, VESKTOP_SUPPORT_CHANNEL_ID];

export const GUILD_IDS = [GUILD_ID, VC_GUILD_ID];
export const SUPPORT_CHANNEL_IDS = [SUPPORT_CHANNEL_ID, VC_SUPPORT_CHANNEL_ID];
export const DONOR_ROLE_IDS = [DONOR_ROLE_ID, VC_DONOR_ROLE_ID];
export const CONTRIB_ROLE_IDS = [CONTRIB_ROLE_ID, VENCORD_CONTRIB_ROLE_ID, VC_CONTRIB_ROLE_ID];

const platform = navigator.platform.toLowerCase();
export const IS_WINDOWS = platform.startsWith("win");
export const IS_MAC = platform.startsWith("mac");
export const IS_LINUX = platform.startsWith("linux");
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Browser_detection_using_the_user_agent#mobile_tablet_or_desktop
// "In summary, we recommend looking for the string Mobi anywhere in the User Agent to detect a mobile device."
export const IS_MOBILE = navigator.userAgent.includes("Mobi");

export interface Dev {
    name: string;
    id: bigint;
    badge?: boolean;
}

/**
 * If you made a plugin or substantial contribution, add yourself here.
 * This object is used for the plugin author list, as well as to add a contributor badge to your profile.
 * If you wish to stay fully anonymous, feel free to set ID to 0n.
 * If you are fine with attribution but don't want the badge, add badge: false
 */
export const Devs = /* #__PURE__*/ Object.freeze({
    Ven: {
        name: "V",
        id: 343383572805058560n
    },
    Apexo: {
        name: "Apexo",
        id: 228548952687902720n
    },
    Arjix: {
        name: "ArjixWasTaken",
        id: 674710789138939916n,
        badge: false
    },
    Cyn: {
        name: "Cynosphere",
        id: 150745989836308480n
    },
    Trwy: {
        name: "trey",
        id: 354427199023218689n
    },
    Megu: {
        name: "Megumin",
        id: 545581357812678656n
    },
    botato: {
        name: "botato",
        id: 440990343899643943n
    },
    fawn: {
        name: "fawn",
        id: 336678828233588736n
    },
    rushii: {
        name: "rushii",
        id: 295190422244950017n
    },
    Glitch: {
        name: "Glitchy",
        id: 269567451199569920n
    },
    Samu: {
        name: "Samu",
        id: 702973430449832038n
    },
    Nyako: {
        name: "nyako",
        id: 118437263754395652n
    },
    MaiKokain: {
        name: "Mai",
        id: 722647978577363026n
    },
    amy: {
        name: "Amy",
        id: 603229858612510720n
    },
    katlyn: {
        name: "katlyn",
        id: 250322741406859265n
    },
    nea: {
        name: "nea",
        id: 310702108997320705n
    },
    Nuckyz: {
        name: "Nuckyz",
        id: 235834946571337729n
    },
    D3SOX: {
        name: "D3SOX",
        id: 201052085641281538n
    },
    Nickyux: {
        name: "Nickyux",
        id: 427146305651998721n
    },
    mantikafasi: {
        name: "mantikafasi",
        id: 287555395151593473n
    },
    Xinto: {
        name: "Xinto",
        id: 423915768191647755n
    },
    JacobTm: {
        name: "Jacob.Tm",
        id: 302872992097107991n
    },
    DustyAngel47: {
        name: "DustyAngel47",
        id: 714583473804935238n
    },
    BanTheNons: {
        name: "BanTheNons",
        id: 460478012794863637n
    },
    BigDuck: {
        name: "BigDuck",
        id: 1024588272623681609n
    },
    AverageReactEnjoyer: {
        name: "Average React Enjoyer",
        id: 1004904120056029256n
    },
    adryd: {
        name: "adryd",
        id: 0n
    },
    Tyman: {
        name: "Tyman",
        id: 487443883127472129n
    },
    afn: {
        name: "afn",
        id: 420043923822608384n
    },
    KraXen72: {
        name: "KraXen72",
        id: 379304073515499530n
    },
    kemo: {
        name: "kemo",
        id: 715746190813298788n
    },
    dzshn: {
        name: "dzshn",
        id: 310449948011528192n
    },
    Ducko: {
        name: "Ducko",
        id: 506482395269169153n
    },
    jewdev: {
        name: "jewdev",
        id: 222369866529636353n
    },
    Luna: {
        name: "Luny",
        id: 821472922140803112n
    },
    Vap: {
        name: "Vap0r1ze",
        id: 454072114492866560n
    },
    KingFish: {
        name: "King Fish",
        id: 499400512559382538n
    },
    Commandtechno: {
        name: "Commandtechno",
        id: 296776625432035328n
    },
    TheSun: {
        name: "sunnie",
        id: 406028027768733696n
    },
    rae: {
        name: "rae",
        id: 1398136199503282277n
    },
    pointy: {
        name: "pointy",
        id: 99914384989519872n
    },
    SammCheese: {
        name: "Samm-Cheese",
        id: 372148345894076416n
    },
    zt: {
        name: "zt",
        id: 289556910426816513n
    },
    captain: {
        name: "Captain",
        id: 347366054806159360n
    },
    nick: {
        name: "nick",
        id: 347884694408265729n,
        badge: false
    },
    whqwert: {
        name: "whqwert",
        id: 586239091520176128n
    },
    lewisakura: {
        name: "lewisakura",
        id: 96269247411400704n
    },
    RuiNtD: {
        name: "RuiNtD",
        id: 157917665162297344n
    },
    hunt: {
        name: "hunt-g",
        id: 222800179697287168n
    },
    cloudburst: {
        name: "cloudburst",
        id: 892128204150685769n
    },
    Aria: {
        name: "Syncxv",
        id: 549244932213309442n
    },
    TheKodeToad: {
        name: "TheKodeToad",
        id: 706152404072267788n
    },
    LordElias: {
        name: "LordElias",
        id: 319460781567639554n
    },
    juby: {
        name: "Juby210",
        id: 324622488644616195n
    },
    Alyxia: {
        name: "Alyxia Sother",
        id: 952185386350829688n
    },
    Remty: {
        name: "Remty",
        id: 335055032204656642n
    },
    skyevg: {
        name: "skyevg",
        id: 1090310844283363348n
    },
    Dziurwa: {
        name: "Dziurwa",
        id: 1001086404203389018n
    },
    arHSM: {
        name: "arHSM",
        id: 841509053422632990n
    },
    AutumnVN: {
        name: "AutumnVN",
        id: 393694671383166998n
    },
    pylix: {
        name: "pylix",
        id: 492949202121261067n
    },
    Tyler: {
        name: "\\\\GGTyler\\\\",
        id: 143117463788191746n
    },
    RyanCaoDev: {
        name: "RyanCaoDev",
        id: 952235800110694471n
    },
    FieryFlames: {
        name: "Fiery",
        id: 890228870559698955n
    },
    KannaDev: {
        name: "Kanna",
        id: 317728561106518019n
    },
    carince: {
        name: "carince",
        id: 818323528755314698n
    },
    PandaNinjas: {
        name: "PandaNinjas",
        id: 455128749071925248n
    },
    CatNoir: {
        name: "CatNoir",
        id: 260371016348336128n
    },
    outfoxxed: {
        name: "outfoxxed",
        id: 837425748435796060n
    },
    UwUDev: {
        name: "UwU",
        id: 691413039156690994n
    },
    amia: {
        name: "amia",
        id: 142007603549962240n
    },
    phil: {
        name: "phil",
        id: 305288513941667851n
    },
    ImLvna: {
        name: "lillith <3",
        id: 799319081723232267n
    },
    rad: {
        name: "rad",
        id: 610945092504780823n
    },
    AndrewDLO: {
        name: "Andrew-DLO",
        id: 434135504792059917n
    },
    HypedDomi: {
        name: "HypedDomi",
        id: 354191516979429376n
    },
    Rini: {
        name: "Rini",
        id: 1079479184478441643n
    },
    castdrian: {
        name: "castdrian",
        id: 224617799434108928n
    },
    Arrow: {
        name: "arrow",
        id: 958158495302176778n
    },
    bb010g: {
        name: "bb010g",
        id: 72791153467990016n
    },
    Dolfies: {
        name: "Dolfies",
        id: 852892297661906993n
    },
    RuukuLada: {
        name: "RuukuLada",
        id: 119705748346241027n
    },
    blahajZip: {
        name: "blahaj.zip",
        id: 683954422241427471n
    },
    archeruwu: {
        name: "archer_uwu",
        id: 160068695383736320n
    },
    ProffDea: {
        name: "ProffDea",
        id: 609329952180928513n
    },
    UlyssesZhan: {
        name: "UlyssesZhan",
        id: 586808226058862623n
    },
    ant0n: {
        name: "ant0n",
        id: 145224646868860928n
    },
    Board: {
        name: "BoardTM",
        id: 285475344817848320n
    },
    philipbry: {
        name: "philipbry",
        id: 554994003318276106n
    },
    Korbo: {
        name: "Korbo",
        id: 455856406420258827n
    },
    maisymoe: {
        name: "maisy",
        id: 257109471589957632n
    },
    Lexi: {
        name: "Lexi",
        id: 506101469787717658n
    },
    Mopi: {
        name: "Mopi",
        id: 1022189106614243350n
    },
    Grzesiek11: {
        name: "Grzesiek11",
        id: 368475654662127616n
    },
    Samwich: {
        name: "Samwich",
        id: 976176454511509554n
    },
    coolelectronics: {
        name: "coolelectronics",
        id: 696392247205298207n
    },
    Av32000: {
        name: "Av32000",
        id: 593436735380127770n
    },
    Noxillio: {
        name: "Noxillio",
        id: 138616536502894592n
    },
    Kyuuhachi: {
        name: "Kyuuhachi",
        id: 236588665420251137n
    },
    nin0dev: {
        name: "nin0dev",
        id: 1395533040914141235n
    },
    Elvyra: {
        name: "Elvyra",
        id: 708275751816003615n
    },
    HappyEnderman: {
        name: "Happy enderman",
        id: 1083437693347827764n
    },
    Vishnya: {
        name: "Vishnya",
        id: 282541644484575233n
    },
    Inbestigator: {
        name: "Inbestigator",
        id: 761777382041714690n
    },
    newwares: {
        name: "newwares",
        id: 421405303951851520n
    },
    JohnyTheCarrot: {
        name: "JohnyTheCarrot",
        id: 132819036282159104n
    },
    puv: {
        name: "puv",
        id: 469441552251355137n
    },
    IcedMarina: {
        name: "icedmarina",
        id: 594406131670188042n
    },
    nakoyasha: {
        name: "nakoyasha",
        id: 222069018507345921n
    },
    Sqaaakoi: {
        name: "Sqaaakoi",
        id: 259558259491340288n
    },
    iamme: {
        name: "i am me",
        id: 984392761929256980n
    },
    Byeoon: {
        name: "byeoon",
        id: 1167275288036655133n
    },
    Kaitlyn: {
        name: "kaitlyn",
        id: 306158896630988801n
    },
    PolisanTheEasyNick: {
        name: "Oleh Polisan",
        id: 242305263313485825n
    },
    HAHALOSAH: {
        name: "HAHALOSAH",
        id: 903418691268513883n
    },
    GabiRP: {
        name: "GabiRP",
        id: 507955112027750401n
    },
    ImBanana: {
        name: "Im_Banana",
        id: 635250116688871425n
    },
    xocherry: {
        name: "xocherry",
        id: 221288171013406720n
    },
    ScattrdBlade: {
        name: "ScattrdBlade",
        id: 678007540608532491n
    },
    goodbee: {
        name: "goodbee",
        id: 658968552606400512n
    },
    Moxxie: {
        name: "Moxxie",
        id: 712653921692155965n
    },
    Ethan: {
        name: "Ethan",
        id: 721717126523781240n
    },
    nyx: {
        name: "verticalsync.",
        id: 1207087393929171095n
    },
    nekohaxx: {
        name: "nekohaxx",
        id: 1176270221628153886n
    },
    Antti: {
        name: "Antti",
        id: 312974985876471810n
    },
    Joona: {
        name: "Joona",
        id: 297410829589020673n
    },
    sadan: {
        name: "sadan",
        id: 521819891141967883n
    },
    Kylie: {
        name: "Cookie",
        id: 721853658941227088n
    },
    AshtonMemer: {
        name: "AshtonMemer",
        id: 373657230530052099n
    },
    surgedevs: {
        name: "Chloe",
        id: 1084592643784331324n
    },
    Lumap: {
        name: "Lumap",
        id: 585278686291427338n
    },
    Obsidian: {
        name: "Obsidian",
        id: 683171006717755446n
    },
    SerStars: {
        name: "SerStars",
        id: 861631850681729045n
    },
    niko: {
        name: "niko",
        id: 341377368075796483n
    },
    relitrix: {
        name: "Relitrix",
        id: 423165393901715456n
    },
    RamziAH: {
        name: "RamziAH",
        id: 1279957227612147747n
    },
    SomeAspy: {
        name: "SomeAspy",
        id: 516750892372852754n
    },
    jamesbt365: {
        name: "jamesbt365",
        id: 158567567487795200n
    },
    samsam: {
        name: "samsam",
        id: 400482410279469056n
    },
    Cootshk: {
        name: "Cootshk",
        id: 921605971577548820n
    },
    thororen: {
        name: "thororen",
        id: 848339671629299742n
    },
    alfred: {
        name: "alfred",
        id: 1038466644353232967n
    },
    vv: {
        name: "VV",
        id: 254866377087778816n
    },
    u32: {
        name: "u32",
        id: 1063237286818488351n,
    },
    prism: {
        name: "prism",
        id: 390884143749136386n,
    },
    Darxoon: {
        name: "Darxoon",
        id: 409745838898937866n
    },
    koish1: {
        name: "koish1",
        id: 291089948709486593n,
        badge: false
    },
    nightmaresan: {
        name: "NightmareSan",
        id: 304239816466235392n
    },
    angelcube: {
        name: "angelcube",
        id: 958505257288208446n
    },
    Lunascape: {
        name: "Lunascape",
        id: 383365021415243776n
    },
    coll: {
        name: "coll",
        id: 0n
    },
    viciouscal: {
        name: "viciouscal",
        id: 0n
    },
    Unknown: {
        name: "Unknown",
        id: 0n
    },
} satisfies Record<string, Dev>);

export const EquicordDevs = Object.freeze({
    nobody: {
        name: "nobody",
        id: 0n
    },
    thororen: {
        name: "thororen",
        id: 848339671629299742n
    },
    dotdas: {
        name: "dotdas",
        id: 353229259482857475n
    },
    nyx: {
        name: "verticalsync",
        id: 1207087393929171095n
    },
    Cortex: {
        name: "Cortex",
        id: 913205935319691335n
    },
    KrystalSkull: {
        name: "krystalskullofficial",
        id: 929208515883569182n
    },
    Naibuu: {
        name: "hs50",
        id: 1120045713867423835n
    },
    Ven: {
        name: "Vee",
        id: 343383572805058560n
    },
    nexpid: {
        name: "Nexpid",
        id: 853550207039832084n
    },
    FoxStorm1: {
        name: "FoxStorm1",
        id: 789872551731527690n
    },
    camila314: {
        name: "camila314",
        id: 738592270617542716n
    },
    Wolfie: {
        name: "wolfieeeeeeee",
        id: 347096063569559553n
    },
    ryan: {
        name: "ryan",
        id: 479403382994632704n
    },
    MrDiamond: {
        name: "MrDiamond",
        id: 523338295644782592n
    },
    Fres: {
        name: "fres",
        id: 843448897737064448n
    },
    Dams: {
        name: "Dams",
        id: 769939285792653325n
    },
    KawaiianPizza: {
        name: "KawaiianPizza",
        id: 501000986735673347n
    },
    Perny: {
        name: "Perny",
        id: 1101508982570504244n
    },
    Jaxx: {
        name: "Jaxx",
        id: 901016640253227059n
    },
    Balaclava: {
        name: "Balaclava",
        id: 854886148455399436n
    },
    dat_insanity: {
        name: "dat_insanity",
        id: 0n
    },
    coolesding: {
        name: "cooles",
        id: 406084422308331522n
    },
    SerStars: {
        name: "SerStars",
        id: 861631850681729045n
    },
    MaxHerbold: {
        name: "MaxHerbold",
        id: 1189527130611138663n
    },
    Combatmaster: {
        name: "Combatmaster331",
        id: 790562534503612437n
    },
    Megal: {
        name: "Megal",
        id: 387790666484285441n
    },
    Synth: {
        name: "synthxcx",
        id: 934393331562205195n
    },
    Hanzy: {
        name: "hanzydev",
        id: 1093131781043126322n
    },
    zoodogood: {
        name: "zoodogood",
        id: 921403577539387454n
    },
    Drag: {
        name: "dragalt_",
        id: 1189903210564038697n
    },
    bhop: {
        name: "femeie",
        id: 442626774841556992n
    },
    Panniku: {
        name: "Panniku",
        id: 703634705152606318n
    },
    Tolgchu: {
        name: "✨Tolgchu✨",
        id: 329671025312923648n
    },
    DaBluLite: {
        name: "DaBluLite",
        id: 582170007505731594n
    },
    meowabyte: {
        name: "meowabyte",
        id: 105170831130234880n
    },
    Fafa: {
        name: "Fafa",
        id: 428188716641812481n
    },
    Colorman: {
        name: "colorman",
        id: 298842558610800650n
    },
    walrus: {
        name: "walrus",
        id: 305317288775778306n
    },
    Prince527: {
        name: "Prince527",
        id: 364105797162237952n
    },
    ThePirateStoner: {
        name: "ThePirateStoner",
        id: 1196220620376121381n
    },
    Sampath: {
        name: "Sampath",
        id: 984015688807100419n
    },
    catcraft: {
        name: "catcraft",
        id: 290162449213292546n
    },
    ShadyGoat: {
        name: "Shady Goat",
        id: 376079696489742338n
    },
    Joona: {
        name: "Joona",
        id: 297410829589020673n
    },
    SimplyData: {
        name: "SimplyData",
        id: 301494563514613762n
    },
    keifufu: {
        name: "keifufu",
        id: 469588398110146590n
    },
    Blackilykat: {
        name: "Blackilykat",
        id: 442033332952498177n
    },
    niko: {
        name: "niko",
        id: 341377368075796483n
    },
    sadan: {
        name: "sadan",
        id: 521819891141967883n
    },
    x3rt: {
        name: "x3rt",
        id: 131602100332396544n
    },
    Hen: {
        name: "Hen",
        id: 279266228151779329n
    },
    Crxa: {
        name: "Crxa",
        id: 711604934201704469n
    },
    vmohammad: {
        name: "vMohammad",
        id: 840854894881538079n
    },
    SpikeHD: {
        name: "SpikeHD",
        id: 221757857836564485n
    },
    bep: {
        name: "bep",
        id: 0n
    },
    llytz: {
        name: "llytz",
        id: 1271128098301022240n
    },
    nin0dev: {
        name: "nin0dev",
        id: 886685857560539176n
    },
    D3SOX: {
        name: "D3SOX",
        id: 201052085641281538n
    },
    newwares: {
        name: "newwares",
        id: 421405303951851520n
    },
    Kyuuhachi: {
        name: "Kyuuhachi",
        id: 236588665420251137n
    },
    ImLvna: {
        name: "lillith <3",
        id: 799319081723232267n
    },
    AutumnVN: {
        name: "AutumnVN",
        id: 393694671383166998n
    },
    Arjix: {
        name: "ArjixWasTaken",
        id: 674710789138939916n,
        badge: false
    },
    Inbestigator: {
        name: "Inbestigator",
        id: 761777382041714690n
    },
    Sqaaakoi: {
        name: "Sqaaakoi",
        id: 259558259491340288n
    },
    Samwich: {
        name: "Samwich",
        id: 976176454511509554n
    },
    TheSun: {
        name: "sunnie",
        id: 406028027768733696n
    },
    TheKodeToad: {
        name: "TheKodeToad",
        id: 706152404072267788n
    },
    Nickyux: {
        name: "Nickyux",
        id: 427146305651998721n
    },
    Ethan: {
        name: "Ethan",
        id: 721717126523781240n
    },
    castdrian: {
        name: "castdrian",
        id: 224617799434108928n
    },
    echo: {
        name: "ECHO",
        id: 712639419785412668n
    },
    RyanCaoDev: {
        name: "RyanCaoDev",
        id: 952235800110694471n
    },
    HypedDomi: {
        name: "HypedDomi",
        id: 354191516979429376n
    },
    Grzesiek11: {
        name: "Grzesiek11",
        id: 368475654662127616n
    },
    Aria: {
        name: "Syncxv",
        id: 549244932213309442n
    },
    ProffDea: {
        name: "ProffDea",
        id: 609329952180928513n
    },
    HappyEnderman: {
        name: "Happy enderman",
        id: 1083437693347827764n
    },
    Nyako: {
        name: "nyako",
        id: 118437263754395652n
    },
    ant0n: {
        name: "ant0n",
        id: 145224646868860928n
    },
    MaiKokain: {
        name: "Mai",
        id: 722647978577363026n
    },
    Korbo: {
        name: "Korbo",
        id: 455856406420258827n
    },
    Moxxie: {
        name: "Moxxie",
        id: 712653921692155965n
    },
    arHSM: {
        name: "arHSM",
        id: 841509053422632990n
    },
    iamme: {
        name: "i am me",
        id: 984392761929256980n
    },
    creations: {
        name: "Creation's",
        id: 209830981060788225n
    },
    Leko: {
        name: "Leko",
        id: 108153734541942784n
    },
    SomeAspy: {
        name: "SomeAspy",
        id: 516750892372852754n
    },
    nvhhr: {
        name: "nvhhr",
        id: 165098921071345666n
    },
    Z1xus: {
        name: "Z1xus",
        id: 377450600797044746n
    },
    Oggetto: {
        name: "Oggetto",
        id: 619203349954166804n
    },
    zyqunix: {
        name: "zyqunix",
        id: 1201415921802170388n
    },
    examplegit: {
        name: "example.user",
        id: 175411535357673473n
    },
    Loukios: {
        name: "Loukios",
        id: 211461918127292416n
    },
    vappstar: {
        name: "vappstar",
        id: 747192967311261748n
    },
    voidbbg: {
        name: "voidbbg",
        id: 117126234588184582n
    },
    OIRNOIR: {
        name: "OIRNOIR",
        id: 720842469024989195n
    },
    cassie: {
        name: "cassie",
        id: 280411966126948353n
    },
    mochienya: {
        name: "mochie",
        id: 1043599230247374869n
    },
    okiso: {
        name: "okiso",
        id: 274178934143451137n
    },
    port22exposed: {
        name: "port",
        id: 1318383159645311009n
    },
    PhoenixAceVFX: {
        name: "PhoenixAceVFX",
        id: 1016895892055396484n
    },
    TheArmagan: {
        name: "TheArmagan",
        id: 707309693449535599n
    },
    seth: {
        name: "S€th",
        id: 1273447359417942128n
    },
    SteelTech: {
        name: "SteelTech",
        id: 1344190786476183643n
    },
    talhakf: {
        name: "talhakf",
        id: 1140716160560676976n
    },
    xijexo: {
        name: "xijexo",
        id: 1284113557201620995n
    },
    omaw: {
        name: "omaw",
        id: 1155026301791514655n
    },
    WKoA: {
        name: "WKoA",
        id: 724416180097384498n
    },
    smuki: {
        name: "smuki",
        id: 691517398523576331n
    },
    ItsAlex: {
        name: "ItsAlex",
        id: 551023598203043840n
    },
    Byeoon: {
        name: "byeoon",
        id: 1167275288036655133n
    },
    Skully: {
        name: "Skully",
        id: 150298098516754432n
    },
    Buzzy: {
        name: "Buzzy",
        id: 1273353654644117585n
    },
    Reycko: {
        name: "Reycko",
        id: 1123725368004726794n
    },
    Campfire: {
        name: "Campfire",
        id: 376414446840578081n
    },
    Cootshk: {
        name: "Cootshk",
        id: 921605971577548820n
    },
    sliwka: {
        name: "sliwka",
        id: 1165286199628419129n
    },
    bbgaming25k: {
        name: "bbgaming25k",
        id: 851222385528274964n
    },
    davidkra230: {
        name: "davidkra230",
        id: 652699312631054356n
    },
    GroupXyz: {
        name: "GroupXyz",
        id: 950033410229944331n
    },
    Suffocate: {
        name: "Suffocate",
        id: 772601756776923187n
    },
    veygax: {
        name: "veygax",
        id: 1119938236245094521n
    },
    secp192k1: {
        name: "secp192k1",
        id: 477497542205243392n
    },
    VillainsRule: {
        name: "VillainsRule",
        id: 0n
    },
    Etorix: {
        name: "Etorix",
        id: 94597845868355584n
    },
    Johannes7k75: {
        name: "Johannes7k75",
        id: 587701169103699994n
    },
    DiabeloDEV: {
        name: "DiabeloDEV",
        id: 1231342375465390100n
    },
    ryanamay: {
        name: "ryanamay",
        id: 1262793452236570667n
    },
    Mocha: {
        name: "Mocha",
        id: 808802000224518264n
    },
    justjxke: {
        name: "justjxke",
        id: 852558183087472640n
    },
    nicola02nb: {
        name: "nicola02nb",
        id: 257900031351193600n
    },
    qouesm: {
        name: "qouesm",
        id: 130388483494641664n
    },
    CallMeGii: {
        name: "gii",
        id: 156481332652802048n
    },
    mmeta: {
        name: "mmeta",
        id: 297075664530440192n
    },
    SSnowly: {
        name: "Snowy",
        id: 1183482753375809537n
    },
    ZcraftElite: {
        name: "ZcraftElite",
        id: 926788037785047050n
    },
    mart: {
        name: "mja00",
        id: 108698087769260032n
    },
    vei: {
        name: "Vei",
        id: 239414094799699968n
    },
    prism: {
        name: "prism",
        id: 390884143749136386n,
    },
    square: {
        name: "square",
        id: 219363409097916416n
    },
    neoarz: {
        name: "neoarz",
        id: 218675193592283137n
    },
    KamiRu: {
        name: "KamiRu",
        id: 819191621676695563n
    },
    soapphia: {
        name: "soap phia",
        id: 1012095822957133976n
    },
    benjii: {
        name: "Benjii",
        id: 463702169443368970n
    },
    keircn: {
        name: "Key",
        id: 1230319937155760131n
    },
    PWall: {
        name: "PWall",
        id: 0n,
    },
    busyboxkitty: {
        name: "busyboxkitty",
        id: 1312185484159483948n
    },
    BioTomateDE: {
        name: "BioTomateDE",
        id: 553499669226061844n,
    },
    korzi: {
        name: "korzi",
        id: 740966310875365416n,
    },
    davri: {
        name: "Davri",
        id: 457579346282938368n,
    },
    yash: {
        name: "yash",
        id: 889150838658977874n,
    },
    Leon135: {
        name: "Leon135",
        id: 309275452231385088n,
    },
    bbpltergiest: {
        name: "bbpltergiest",
        id: 279448683672502274n,
    },
    mshl: {
        name: "m.shl",
        id: 1025245410224263258n,
    },
    BigDuck: {
        name: "BigDuck",
        id: 635250116688871425n
    },
    AverageReactEnjoyer: {
        name: "AverageReactEnjoyer",
        id: 452506270785544n,
        badge: false
    },
    Nuckyz: {
        name: "Nuckyz",
        id: 584502988836544522n
    },
    dzshn: {
        name: "dzshn",
        id: 310449948011528192n
    },
    nickwoah: {
        name: "nickwoah",
        id: 644298972420374528n
    },
    dka: {
        name: "DKA",
        id: 119386840624005121n
    },
    Kiri: {
        name: "Kiri",
        id: 310525496771346434n
    },
    Gir0fa: {
        name: "gir0fa",
        id: 1282734265955520545n
    },
    yonn2222: {
        name: "yonn2222",
        id: 821835831844012103n
    },
    Moowi: {
        name: "Moowi",
        id: 246128594756173824n
    },
    sketchmyname: {
        name: "sketchmyname",
        id: 1412164910443663491n
    },
    NassCT: {
        name: "NassCT",
        id: 354996937868705793n
    },
    yafyx: {
        name: "kiniyaku",
        id: 658209494609821699n
    },
    dhopcs: {
        name: "dhopcs",
        id: 206309860038410240n
    },
    qdnx: {
        name: "qdnx",
        id: 1374803023506702508n
    },
} satisfies Record<string, Dev>);

// iife so #__PURE__ works correctly
export const VencordDevsById = /* #__PURE__*/ (() =>
    Object.freeze(Object.fromEntries(
        Object.entries(Devs)
            .filter(d => d[1].id !== 0n)
            .map(([_, v]) => [v.id, v] as const)
    ))
)() as Record<string, Dev>;

export const EquicordDevsById = /* #__PURE__*/ (() =>
    Object.freeze(Object.fromEntries(
        Object.entries(EquicordDevs)
            .filter(d => d[1].id !== 0n)
            .map(([_, v]) => [v.id, v] as const)
    ))
)() as Record<string, Dev>;

export const ZENKORD_LOGO = "data:image/png;base64,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";
