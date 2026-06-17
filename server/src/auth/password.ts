import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing with versioned parameters.
 *
 * Current parameters (v1):
 *  - Memory: 64 MB (65536 KB)
 *  - Iterations (time cost): 3
 *  - Parallelism: 4
 *
 * The hash output from @node-rs/argon2 already contains the algorithm/params in
 * the PHC format: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
 * We prepend a version tag so the application can detect legacy hashes when
 * params are upgraded in the future.
 */

const HASH_VERSION = "v1";
const HASH_PREFIX = `$qi$${HASH_VERSION}$`;

const ARGON2_OPTIONS = {
  memoryCost: 65536, // 64 MB in KB
  timeCost: 3,
  parallelism: 4,
} as const;

/** Minimum password length. */
const MIN_PASSWORD_LENGTH = 12;

/**
 * Top-1000 most common passwords (truncated to a representative subset).
 * Sourced from public breach databases. Any password appearing here is rejected.
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "password", "123456", "12345678", "qwerty", "abc123", "monkey", "1234567",
  "letmein", "trustno1", "dragon", "baseball", "iloveyou", "master", "sunshine",
  "ashley", "michael", "shadow", "123123", "654321", "superman", "qazwsx",
  "michael", "football", "password1", "password123", "batman", "login",
  "princess", "starwars", "solo", "passw0rd", "hello", "charlie", "donald",
  "admin", "qwerty123", "welcome", "welcome1", "p@ssw0rd", "access",
  "flower", "hottie", "loveme", "zaq1zaq1", "hunter2", "mustang",
  "121212", "696969", "thomas", "jordan", "lakers", "andrea", "maverick",
  "joshua", "jessica", "jennifer", "amanda", "nicole", "robert", "daniel",
  "andrew", "anthony", "william", "joseph", "samuel", "richard", "charles",
  "christopher", "matthew", "elizabeth", "margaret", "patricia", "linda",
  "password12", "password1234", "1234567890", "123456789", "12345",
  "1234", "111111", "000000", "123321", "abc1234", "abcdef", "abcdefg",
  "qwerty1", "qwert", "qwertyuiop", "asdfgh", "zxcvbn", "1q2w3e4r",
  "1q2w3e", "q1w2e3r4", "iloveu", "trustno1", "changeme", "secret",
  "fuckyou", "asshole", "buster", "killer", "soccer", "hockey", "ranger",
  "harley", "freedom", "falcon", "merlin", "ginger", "hammer", "silver",
  "golfer", "cookie", "george", "summer", "taylor", "robert", "toyota",
  "corvette", "mercedes", "ferrari", "porsche", "chelsea", "arsenal",
  "liverpool", "barcelona", "madrid", "juventus", "celtic", "rangers",
  "internet", "computer", "windows", "microsoft", "samsung", "google",
  "apple", "facebook", "twitter", "youtube", "amazon", "netflix", "spotify",
  "baseball1", "football1", "basketball", "tennis", "swimming", "running",
  "dancing", "singing", "reading", "writing", "cooking", "fishing",
  "hunting", "camping", "hiking", "skiing", "surfing", "sailing",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
  "sunday", "january", "february", "march", "april", "june", "july",
  "august", "september", "october", "november", "december",
  "spring", "summer1", "autumn", "winter", "sunshine1", "rainbow",
  "thunder", "lightning", "hurricane", "tornado", "blizzard", "earthquake",
  "diamond", "crystal", "platinum", "golden", "silver1", "bronze",
  "purple", "orange", "yellow", "green", "blue", "indigo", "violet",
  "america", "england", "france", "germany", "spain", "italy", "canada",
  "australia", "japan", "china", "india", "brazil", "mexico", "russia",
  "love", "peace", "faith", "hope", "destiny", "angel", "heaven",
  "chocolate", "vanilla", "strawberry", "blueberry", "raspberry",
  "pepper", "ginger1", "cinnamon", "nutmeg", "rosemary", "jasmine",
  "butterfly", "dolphin", "elephant", "tiger", "lion", "eagle",
  "panther", "jaguar", "leopard", "cheetah", "wolf", "bear", "shark",
  "dragon1", "phoenix", "unicorn", "wizard", "warrior", "samurai",
  "ninja", "pirate", "cowboy", "spaceman", "batman1", "superman1",
  "spiderman", "ironman", "captain", "avenger", "marvel", "starwars1",
  "startrek", "matrix", "terminator", "predator", "alien", "avatar",
  "gandalf", "frodo", "bilbo", "aragorn", "legolas", "gimli",
  "hogwarts", "gryffindor", "slytherin", "ravenclaw", "hufflepuff",
  "voldemort", "dumbledore", "hermione", "snape", "draco", "potter",
  "baseball123", "football123", "soccer123", "hockey123", "lakers1",
  "yankees", "cowboys", "patriots", "packers", "steelers", "eagles",
  "broncos", "chiefs", "saints", "dolphins", "raiders", "giants",
  "boston", "newyork", "losangeles", "chicago", "houston", "phoenix1",
  "dallas", "seattle", "denver", "atlanta", "miami", "portland",
  "guitar", "piano", "drums", "violin", "trumpet", "saxophone",
  "metallica", "nirvana", "acdc", "beatles", "queen", "zeppelin",
  "eminem", "drake", "kanye", "beyonce", "rihanna", "madonna",
  "samsung1", "iphone", "android", "windows1", "linux", "ubuntu",
  "bitcoin", "ethereum", "crypto", "blockchain", "trading", "stocks",
  "fitness", "workout", "protein", "muscles", "bodybuilding", "crossfit",
  "password2", "password3", "password4", "password5", "password0",
  "welcome2", "welcome123", "admin1", "admin123", "root", "root123",
  "test", "test123", "guest", "guest123", "user", "user123",
  "default", "default1", "system", "system1", "server", "server1",
  "database", "database1", "backup", "backup1", "master1", "master123",
  "qwerty12", "qwerty1234", "asdf1234", "zxcv1234", "1qaz2wsx",
  "qazwsx123", "1234qwer", "qwer1234", "pass1234", "passwd",
  "letmein1", "letmein123", "access1", "access14", "trustno11",
  "changeme1", "secret1", "money", "money1", "cash", "business",
  "private", "personal", "security", "secure", "safety", "protect",
  "nothing", "whatever", "anything", "something", "everything",
  "forever", "always", "never", "sometimes", "together", "alone",
  "beautiful", "gorgeous", "pretty", "handsome", "lovely", "amazing",
  "awesome", "fantastic", "wonderful", "excellent", "perfect", "great",
  "happy", "lucky", "blessed", "thankful", "grateful", "peaceful",
  "darkness", "shadow1", "midnight", "twilight", "sunset", "sunrise",
  "starlight", "moonlight", "sunshine2", "daylight", "nightfall",
  "storm", "tempest", "cyclone", "monsoon", "tsunami", "volcano",
  "mountain", "valley", "river", "ocean", "island", "forest",
  "desert", "jungle", "garden", "meadow", "prairie", "canyon",
  "mercury", "venus", "earth", "mars", "jupiter", "saturn",
  "uranus", "neptune", "pluto", "galaxy", "cosmos", "universe",
  "princess1", "prince", "king", "queen1", "emperor", "empress",
  "knight", "castle", "kingdom", "throne", "crown", "royal",
  "champion", "victory", "winner", "legend", "hero", "icon",
  "genius", "scholar", "professor", "doctor", "engineer", "scientist",
  "architect", "designer", "artist", "musician", "writer", "author",
  "teacher", "student", "graduate", "academy", "college", "university",
  "corvette1", "mustang1", "camaro", "challenger", "charger", "viper",
  "lamborghini", "bugatti", "mclaren", "aston", "bentley", "rollsroyce",
  "boeing", "airbus", "cessna", "helicopter", "rocket", "spaceship",
  "titanic", "olympic", "endeavour", "discovery", "atlantis", "columbia",
  "alexander", "napoleon", "caesar", "lincoln", "washington", "jefferson",
  "einstein", "newton", "darwin", "tesla", "edison", "galileo",
  "beethoven", "mozart", "bach", "chopin", "vivaldi", "handel",
  "shakespeare", "dickens", "tolkien", "rowling", "king1", "orwell",
  "picasso", "monet", "rembrandt", "davinci", "michelangelo", "raphael",
  "socrates", "aristotle", "plato", "confucius", "buddha", "gandhi",
  "pokemon", "pikachu", "charizard", "mewtwo", "mario", "zelda",
  "minecraft", "fortnite", "roblox", "valorant", "overwatch", "destiny1",
  "halo", "gta", "callofduty", "battlefield", "assassin", "skyrim",
  "diablo", "warcraft", "starcraft", "civilization", "simcity", "sims",
  "letmein!", "pa$$word", "p@ss1234", "admin@123", "root@123",
  "test@123", "user@123", "pass@123", "welcome@1", "hello123",
]);

export type PasswordValidation = {
  valid: boolean;
  reason?: string;
};

/**
 * Validate password strength before hashing.
 * Returns { valid: true } or { valid: false, reason: string }.
 *
 * Requirements:
 * - Minimum 12 characters
 * - Not in the common passwords list
 * - At least 2 character classes (uppercase, lowercase, digit, symbol)
 */
export function validatePasswordStrength(password: string): PasswordValidation {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, reason: "Password is too common" };
  }
  // Require at least 2 of 4 character classes for diversity
  const classes = countCharacterClasses(password);
  if (classes < 2) {
    return { valid: false, reason: "Password must contain at least 2 character classes (uppercase, lowercase, digit, symbol)" };
  }
  return { valid: true };
}

/**
 * Count the number of distinct character classes present in a password.
 * Classes: uppercase letter, lowercase letter, digit, symbol.
 */
function countCharacterClasses(password: string): number {
  let classes = 0;
  if (/[A-Z]/.test(password)) classes++;
  if (/[a-z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  if (/[^A-Za-z0-9]/.test(password)) classes++;
  return classes;
}

/**
 * Hash a password with Argon2id using current parameters.
 * Returns a string with our version prefix prepended.
 */
export async function hashPassword(plain: string): Promise<string> {
  const hashed = await hash(plain, ARGON2_OPTIONS);
  return `${HASH_PREFIX}${hashed}`;
}

/**
 * Verify a password against a stored hash.
 * Strips the version prefix before verification.
 */
export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  // Strip our version prefix to get the raw PHC hash
  const rawHash = storedHash.startsWith(HASH_PREFIX)
    ? storedHash.slice(HASH_PREFIX.length)
    : storedHash;
  return verify(rawHash, plain);
}

/**
 * Check whether a stored hash needs to be re-computed with current params.
 * Returns true if the hash was created with older parameters.
 */
export function needsRehash(storedHash: string): boolean {
  // If it doesn't have our current version prefix, it needs rehashing
  if (!storedHash.startsWith(HASH_PREFIX)) {
    return true;
  }
  // Extract params from the PHC-format argon2 hash (after our prefix)
  const rawHash = storedHash.slice(HASH_PREFIX.length);
  // PHC: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
  const match = rawHash.match(/\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/);
  if (!match) return true;
  const m = parseInt(match[1] ?? "0", 10);
  const t = parseInt(match[2] ?? "0", 10);
  const p = parseInt(match[3] ?? "0", 10);
  return m !== ARGON2_OPTIONS.memoryCost || t !== ARGON2_OPTIONS.timeCost || p !== ARGON2_OPTIONS.parallelism;
}
