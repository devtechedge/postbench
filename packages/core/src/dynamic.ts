// Dynamic variables (`{{$name}}`). The set of names matches what Postman
// documents publicly; the word lists and generators here are original and
// only aim to produce values of the same shape.

export interface DynamicVariable {
  description: string;
  generator: () => string | number | boolean;
}

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(xs: readonly T[]): T => xs[rnd(xs.length)]!;
const hex = (n: number) => Array.from({ length: n }, () => rnd(16).toString(16)).join("");
const digits = (n: number) => Array.from({ length: n }, () => rnd(10)).join("");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const h = hex(32).split("");
  h[12] = "4";
  h[16] = "89ab"[rnd(4)]!;
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const FIRST = ["Asha", "Ravi", "Maya", "Noah", "Lena", "Omar", "Iris", "Kai", "Zara", "Theo", "Nina", "Arun", "Ella", "Ivan", "Mira"];
const LAST = ["Sharma", "Okafor", "Lindqvist", "Moreau", "Tanaka", "Silva", "Novak", "Haddad", "Fischer", "Reyes", "Kowalski", "Baker"];
const WORDS = ["amber", "orbit", "cedar", "quartz", "harbor", "signal", "lumen", "delta", "ember", "prism", "summit", "vector", "willow", "cobalt", "meadow"];
const ADJ = ["swift", "quiet", "bright", "bold", "gentle", "rapid", "lucid", "steady", "vivid", "nimble"];
const NOUN = ["bridge", "engine", "garden", "packet", "river", "socket", "tower", "window", "lattice", "beacon"];
const VERB = ["compile", "route", "index", "parse", "render", "sync", "cache", "deploy", "query", "stream"];
const ING = ["compiling", "routing", "indexing", "parsing", "rendering", "syncing", "caching", "deploying"];
const CITY = ["Pune", "Lisbon", "Osaka", "Nairobi", "Toronto", "Oslo", "Bogota", "Hanoi", "Perth", "Cairo"];
const STREET = ["Maple", "Station", "Harbor", "Mill", "Park", "River", "Hill", "Lake"];
const COUNTRY: [string, string][] = [["India", "IN"], ["Portugal", "PT"], ["Japan", "JP"], ["Kenya", "KE"], ["Canada", "CA"], ["Norway", "NO"], ["Brazil", "BR"]];
const CURRENCY: [string, string, string][] = [["INR", "Indian Rupee", "\u20b9"], ["EUR", "Euro", "\u20ac"], ["JPY", "Yen", "\u00a5"], ["USD", "US Dollar", "$"], ["GBP", "Pound Sterling", "\u00a3"]];
const COLORS = ["red", "teal", "violet", "olive", "indigo", "coral", "navy", "plum", "salmon", "azure"];
const TLD = ["com", "net", "org", "io", "dev", "info", "biz"];
const MIME: [string, string, string][] = [["application/json", "json", "application"], ["text/plain", "txt", "text"], ["image/png", "png", "image"], ["audio/mpeg", "mp3", "audio"], ["video/mp4", "mp4", "video"], ["application/pdf", "pdf", "application"]];
const DEPT = ["Engineering", "Sales", "Support", "Finance", "Design", "Legal", "Research"];
const JOBAREA = ["Platform", "Data", "Security", "Growth", "Infrastructure", "Quality"];
const JOBTYPE = ["Engineer", "Manager", "Analyst", "Architect", "Designer", "Consultant"];
const JOBDESC = ["Senior", "Lead", "Principal", "Junior", "Staff", "Chief"];
const PRODUCT = ["Chair", "Lamp", "Keyboard", "Bottle", "Backpack", "Desk", "Mug", "Speaker"];
const MATERIAL = ["Steel", "Cotton", "Bamboo", "Granite", "Wooden", "Plastic", "Leather"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LOCALES = ["en", "fr", "de", "ja", "hi", "pt_BR", "es", "nl"];
const DB_TYPES = ["int", "varchar", "text", "boolean", "timestamp", "bigint", "uuid"];
const DB_COLS = ["id", "title", "name", "email", "status", "createdAt", "updatedAt"];
const DB_ENGINES = ["InnoDB", "MyISAM", "MEMORY", "ARCHIVE"];
const COLLATIONS = ["utf8_general_ci", "utf8_bin", "ascii_bin", "cp1250_general_ci"];
const ABBR = ["HTTP", "JSON", "TCP", "SQL", "XML", "SSL", "API", "CSS", "RAM", "PCI"];
const PROTOCOLS = ["http", "https"];
const TXN = ["deposit", "withdrawal", "payment", "invoice"];
const PREFIX = ["Mr.", "Ms.", "Dr.", "Mx."];
const SUFFIX = ["Jr.", "Sr.", "II", "III", "PhD"];
const CO_SUFFIX = ["Inc", "LLC", "Group", "Labs"];
const UA = [
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

const sentence = (n = 6 + rnd(6)) => cap(Array.from({ length: n }, () => pick(WORDS)).join(" ")) + ".";
const paragraph = () => Array.from({ length: 3 }, () => sentence()).join(" ");
const firstName = () => pick(FIRST);
const lastName = () => pick(LAST);
const domainWord = () => pick(WORDS) + "-" + pick(NOUN);
const domain = () => `${domainWord()}.${pick(TLD)}`;
const isoDate = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString();
const image = (topic: string) => () => `http://placeimg.local/640/480/${topic}`;

const table: Record<string, [string, () => string | number | boolean]> = {
  $guid: ["A v4 UUID", uuid],
  $timestamp: ["Current Unix time in seconds", () => Math.round(Date.now() / 1000)],
  $isoTimestamp: ["Current ISO-8601 timestamp (UTC)", () => new Date().toISOString()],
  $randomUUID: ["A random v4 UUID", uuid],
  $randomAlphaNumeric: ["A single alphanumeric character", () => pick("abcdefghijklmnopqrstuvwxyz0123456789".split(""))],
  $randomBoolean: ["true or false", () => Math.random() < 0.5],
  $randomInt: ["An integer from 0 to 1000 inclusive", () => rnd(1001)],
  $randomColor: ["A color name", () => pick(COLORS)],
  $randomHexColor: ["A hex color", () => `#${hex(6)}`],
  $randomAbbreviation: ["A tech abbreviation", () => pick(ABBR)],
  $randomIP: ["An IPv4 address", () => [rnd(256), rnd(256), rnd(256), rnd(256)].join(".")],
  $randomMACAddress: ["A MAC address", () => Array.from({ length: 6 }, () => hex(2)).join(":")],
  $randomPassword: ["A 15 character password", () => Array.from({ length: 15 }, () => pick("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789".split(""))).join("")],
  $randomLocale: ["A locale code", () => pick(LOCALES)],
  $randomUserAgent: ["A browser user agent", () => pick(UA)],
  $randomProtocol: ["http or https", () => pick(PROTOCOLS)],
  $randomSemver: ["A semantic version", () => `${rnd(10)}.${rnd(10)}.${rnd(10)}`],
  $randomFirstName: ["A first name", firstName],
  $randomLastName: ["A last name", lastName],
  $randomFullName: ["A full name", () => `${firstName()} ${lastName()}`],
  $randomNamePrefix: ["A name prefix", () => pick(PREFIX)],
  $randomNameSuffix: ["A name suffix", () => pick(SUFFIX)],
  $randomJobArea: ["A job area", () => pick(JOBAREA)],
  $randomJobDescriptor: ["A job descriptor", () => pick(JOBDESC)],
  $randomJobTitle: ["A job title", () => `${pick(JOBDESC)} ${pick(JOBAREA)} ${pick(JOBTYPE)}`],
  $randomJobType: ["A job type", () => pick(JOBTYPE)],
  $randomPhoneNumber: ["A ten digit phone number", () => `${digits(3)}-${digits(3)}-${digits(4)}`],
  $randomPhoneNumberExt: ["A phone number with extension", () => `${digits(2)}-${digits(3)}-${digits(3)}-${digits(4)}`],
  $randomCity: ["A city", () => pick(CITY)],
  $randomStreetName: ["A street name", () => `${pick(STREET)} Street`],
  $randomStreetAddress: ["A street address", () => `${1 + rnd(9999)} ${pick(STREET)} Street`],
  $randomCountry: ["A country", () => pick(COUNTRY)[0]],
  $randomCountryCode: ["A two letter country code", () => pick(COUNTRY)[1]],
  $randomLatitude: ["A latitude", () => (Math.random() * 180 - 90).toFixed(4)],
  $randomLongitude: ["A longitude", () => (Math.random() * 360 - 180).toFixed(4)],
  $randomAvatarImage: ["An avatar image URL", image("avatar")],
  $randomImageUrl: ["An image URL", image("any")],
  $randomAbstractImage: ["Abstract image URL", image("abstract")],
  $randomAnimalsImage: ["Animal image URL", image("animals")],
  $randomBusinessImage: ["Business image URL", image("business")],
  $randomCatsImage: ["Cat image URL", image("cats")],
  $randomCityImage: ["City image URL", image("city")],
  $randomFoodImage: ["Food image URL", image("food")],
  $randomNightlifeImage: ["Nightlife image URL", image("nightlife")],
  $randomFashionImage: ["Fashion image URL", image("fashion")],
  $randomPeopleImage: ["People image URL", image("people")],
  $randomNatureImage: ["Nature image URL", image("nature")],
  $randomSportsImage: ["Sports image URL", image("sports")],
  $randomTransportImage: ["Transport image URL", image("transport")],
  $randomImageDataUri: ["A small SVG data URI", () => "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%2F%3E"],
  $randomBankAccount: ["An 8 digit account number", () => digits(8)],
  $randomBankAccountName: ["An account name", () => `${pick(["Personal", "Savings", "Checking", "Business"])} Account`],
  $randomCreditCardMask: ["Last four digits", () => digits(4)],
  $randomBankAccountBic: ["A BIC code", () => `${pick(ABBR)}${pick(COUNTRY)[1]}${digits(2)}`.toUpperCase().slice(0, 8)],
  $randomBankAccountIban: ["An IBAN like value", () => `${pick(COUNTRY)[1]}${digits(2)}${digits(18)}`],
  $randomTransactionType: ["A transaction type", () => pick(TXN)],
  $randomCurrencyCode: ["A currency code", () => pick(CURRENCY)[0]],
  $randomCurrencyName: ["A currency name", () => pick(CURRENCY)[1]],
  $randomCurrencySymbol: ["A currency symbol", () => pick(CURRENCY)[2]],
  $randomBitcoin: ["A bitcoin address like value", () => "1" + hex(33)],
  $randomCompanyName: ["A company name", () => `${cap(pick(WORDS))} ${pick(CO_SUFFIX)}`],
  $randomCompanySuffix: ["A company suffix", () => pick(CO_SUFFIX)],
  $randomBs: ["A business phrase", () => `${pick(VERB)} ${pick(ADJ)} ${pick(NOUN)}s`],
  $randomBsAdjective: ["A business adjective", () => pick(ADJ)],
  $randomBsBuzz: ["A business verb", () => pick(VERB)],
  $randomBsNoun: ["A business noun", () => pick(NOUN)],
  $randomCatchPhrase: ["A catch phrase", () => `${cap(pick(ADJ))} ${pick(ADJ)} ${pick(NOUN)}`],
  $randomCatchPhraseAdjective: ["A catch phrase adjective", () => cap(pick(ADJ))],
  $randomCatchPhraseDescriptor: ["A catch phrase descriptor", () => pick(ADJ)],
  $randomCatchPhraseNoun: ["A catch phrase noun", () => pick(NOUN)],
  $randomDatabaseColumn: ["A database column", () => pick(DB_COLS)],
  $randomDatabaseType: ["A database type", () => pick(DB_TYPES)],
  $randomDatabaseCollation: ["A database collation", () => pick(COLLATIONS)],
  $randomDatabaseEngine: ["A database engine", () => pick(DB_ENGINES)],
  $randomDateFuture: ["A date within the next year", () => isoDate(1 + rnd(365))],
  $randomDatePast: ["A date within the last year", () => isoDate(-1 - rnd(365))],
  $randomDateRecent: ["A date within the last day", () => isoDate(-Math.random())],
  $randomWeekday: ["A weekday", () => pick(DAYS)],
  $randomMonth: ["A month", () => pick(MONTHS)],
  $randomDomainName: ["A domain name", domain],
  $randomDomainSuffix: ["A domain suffix", () => pick(TLD)],
  $randomDomainWord: ["A domain word", domainWord],
  $randomEmail: ["An email address", () => `${firstName()}.${lastName()}@${domain()}`.toLowerCase()],
  $randomExampleEmail: ["An example.com style email", () => `${firstName()}${rnd(100)}@example.${pick(["com", "net", "org"])}`.toLowerCase()],
  $randomUserName: ["A username", () => `${firstName()}${rnd(100)}`],
  $randomUrl: ["A URL", () => `${pick(PROTOCOLS)}://${domain()}`],
  $randomFileName: ["A file name", () => `${pick(WORDS)}_${pick(NOUN)}.${pick(MIME)[1]}`],
  $randomFileType: ["A file type", () => pick(MIME)[2]],
  $randomFileExt: ["A file extension", () => pick(MIME)[1]],
  $randomCommonFileName: ["A common file name", () => `${pick(WORDS)}.${pick(["pdf", "txt", "png", "mp3"])}`],
  $randomCommonFileType: ["A common file type", () => pick(["application", "audio", "image", "text", "video"])],
  $randomCommonFileExt: ["A common file extension", () => pick(["pdf", "txt", "png", "mp3", "mp4", "jpg"])],
  $randomFilePath: ["A file path", () => `/${pick(WORDS)}/${pick(NOUN)}/${pick(WORDS)}.${pick(MIME)[1]}`],
  $randomDirectoryPath: ["A directory path", () => `/${pick(WORDS)}/${pick(NOUN)}`],
  $randomMimeType: ["A MIME type", () => pick(MIME)[0]],
  $randomPrice: ["A price with two decimals", () => (Math.random() * 1000).toFixed(2)],
  $randomProduct: ["A product", () => pick(PRODUCT)],
  $randomProductAdjective: ["A product adjective", () => cap(pick(ADJ))],
  $randomProductMaterial: ["A product material", () => pick(MATERIAL)],
  $randomProductName: ["A product name", () => `${cap(pick(ADJ))} ${pick(MATERIAL)} ${pick(PRODUCT)}`],
  $randomDepartment: ["A department", () => pick(DEPT)],
  $randomNoun: ["A noun", () => pick(NOUN)],
  $randomVerb: ["A verb", () => pick(VERB)],
  $randomIngverb: ["A verb ending in -ing", () => pick(ING)],
  $randomAdjective: ["An adjective", () => pick(ADJ)],
  $randomWord: ["A word", () => pick(WORDS)],
  $randomWords: ["A few words", () => Array.from({ length: 2 + rnd(3) }, () => pick(WORDS)).join(" ")],
  $randomPhrase: ["A phrase", () => `${cap(pick(VERB))} the ${pick(ADJ)} ${pick(NOUN)}.`],
  $randomLoremWord: ["A filler word", () => pick(WORDS)],
  $randomLoremWords: ["Three filler words", () => Array.from({ length: 3 }, () => pick(WORDS)).join(" ")],
  $randomLoremSentence: ["A filler sentence", () => sentence()],
  $randomLoremSentences: ["A few filler sentences", () => Array.from({ length: 2 + rnd(4) }, () => sentence()).join(" ")],
  $randomLoremParagraph: ["A filler paragraph", paragraph],
  $randomLoremParagraphs: ["Three filler paragraphs", () => [paragraph(), paragraph(), paragraph()].join("\n \r")],
  $randomLoremText: ["Filler text", () => sentence()],
  $randomLoremSlug: ["A slug", () => Array.from({ length: 3 }, () => pick(WORDS)).join("-")],
  $randomLoremLines: ["Filler lines", () => Array.from({ length: 1 + rnd(5) }, () => sentence()).join("\n")],
};

export const dynamicVariables: Record<string, DynamicVariable> = Object.fromEntries(
  Object.entries(table).map(([k, [description, generator]]) => [k, { description, generator }]),
);

export const dynamicVariableNames = Object.keys(dynamicVariables);
