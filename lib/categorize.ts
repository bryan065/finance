// lib/categorize.ts
// Two-pass transaction categorization:
//   1. Keyword lookup  — instant, free, covers common Canadian merchants
//   2. Claude API      — one batch call for anything not matched by the lookup

import Anthropic from '@anthropic-ai/sdk'

// ── Categories ────────────────────────────────────────────────────────────────
// Keep in sync with CATEGORIES in TransactionsDashboard.tsx

export const CATEGORIES = [
  'Groceries', 'Restaurants', 'Coffee', 'Alcohol', 'Food Delivery',
  'Mortgage', 'HELOC', 'Property Tax', 'Home Insurance', 'Home Maintenance',
  'Gas', 'Parking', 'Transit', 'Car Insurance', 'Car Maintenance',
  'Streaming', 'Entertainment', 'Travel',
  'Clothing', 'Health', 'Pharmacy', 'Gym',
  'Internet', 'Phone', 'Hydro', 'Other',
] as const

export type Category = (typeof CATEGORIES)[number]

// ── Keyword lookup table ───────────────────────────────────────────────────────
// Order matters: more specific patterns should come first.
// Pattern is matched case-insensitively against the merchant name.

const LOOKUP: { pattern: RegExp; category: Category }[] = [
  // ── Groceries ────────────────────────────────────────────────────────────
  { pattern: /loblaws|no frills|president.s choice|pc express/i,     category: 'Groceries' },
  { pattern: /metro\b|metro grocery/i,                                category: 'Groceries' },
  { pattern: /sobeys|safeway|iga\b/i,                                 category: 'Groceries' },
  { pattern: /freshco|fresh co/i,                                     category: 'Groceries' },
  { pattern: /t&t|t & t supermarket/i,                                category: 'Groceries' },
  { pattern: /farm boy/i,                                             category: 'Groceries' },
  { pattern: /whole foods/i,                                          category: 'Groceries' },
  { pattern: /wal.?mart/i,                                            category: 'Groceries' },
  { pattern: /costco/i,                                               category: 'Groceries' },
  { pattern: /food basics|bulk barn/i,                                category: 'Groceries' },

  // ── Coffee ────────────────────────────────────────────────────────────────
  { pattern: /tim horton/i,                                           category: 'Coffee' },
  { pattern: /starbucks/i,                                            category: 'Coffee' },
  { pattern: /second cup/i,                                           category: 'Coffee' },
  { pattern: /williams coffee/i,                                      category: 'Coffee' },
  { pattern: /balzac/i,                                               category: 'Coffee' },
  { pattern: /coffee\s+shop|cafe\b|espresso bar/i,                    category: 'Coffee' },

  // ── Food Delivery ─────────────────────────────────────────────────────────
  { pattern: /doordash/i,                                             category: 'Food Delivery' },
  { pattern: /uber\s*eats/i,                                          category: 'Food Delivery' },
  { pattern: /skip\s*the\s*dishes|skipthedishes/i,                    category: 'Food Delivery' },
  { pattern: /instacart/i,                                            category: 'Food Delivery' },

  // ── Alcohol ───────────────────────────────────────────────────────────────
  { pattern: /lcbo/i,                                                 category: 'Alcohol' },
  { pattern: /beer store/i,                                           category: 'Alcohol' },
  { pattern: /wine rack/i,                                            category: 'Alcohol' },
  { pattern: /brewer.s retail/i,                                      category: 'Alcohol' },

  // ── Restaurants ───────────────────────────────────────────────────────────
  { pattern: /mcdonald.s|mcdo\b/i,                                    category: 'Restaurants' },
  { pattern: /subway\b/i,                                             category: 'Restaurants' },
  { pattern: /burger king/i,                                          category: 'Restaurants' },
  { pattern: /harvey.s/i,                                             category: 'Restaurants' },
  { pattern: /swiss chalet/i,                                         category: 'Restaurants' },
  { pattern: /jack astor/i,                                           category: 'Restaurants' },
  { pattern: /boston pizza/i,                                         category: 'Restaurants' },
  { pattern: /montana.s/i,                                            category: 'Restaurants' },
  { pattern: /east side mario/i,                                      category: 'Restaurants' },
  { pattern: /keg\b|the keg/i,                                        category: 'Restaurants' },
  { pattern: /pizza hut|domino.s|papa john/i,                         category: 'Restaurants' },
  { pattern: /wendy.s/i,                                              category: 'Restaurants' },
  { pattern: /a&w\b/i,                                                category: 'Restaurants' },
  { pattern: /popeyes|kfc\b/i,                                        category: 'Restaurants' },
  { pattern: /sushi|ramen|pho\b|thai|dim sum/i,                       category: 'Restaurants' },
  { pattern: /chipotle|five guys|shake shack/i,                       category: 'Restaurants' },

  // ── Gas ───────────────────────────────────────────────────────────────────
  { pattern: /petro.canada|petrocan/i,                                category: 'Gas' },
  { pattern: /shell\b.*gas|gas.*\bshell\b/i,                         category: 'Gas' },
  { pattern: /\besso\b/i,                                             category: 'Gas' },
  { pattern: /husky\b/i,                                              category: 'Gas' },
  { pattern: /ultramar/i,                                             category: 'Gas' },
  { pattern: /pioneer gas|pioneer petro/i,                            category: 'Gas' },
  { pattern: /gas station|fuel|gasoline/i,                            category: 'Gas' },

  // ── Transit ───────────────────────────────────────────────────────────────
  { pattern: /presto card|presto transit/i,                           category: 'Transit' },
  { pattern: /metrolinx/i,                                            category: 'Transit' },
  { pattern: /\bttc\b/i,                                              category: 'Transit' },
  { pattern: /go train|go transit|via rail/i,                         category: 'Transit' },
  { pattern: /oc transpo/i,                                           category: 'Transit' },
  { pattern: /\buber\b(?!.*eat)/i,                                    category: 'Transit' },
  { pattern: /lyft\b/i,                                               category: 'Transit' },

  // ── Parking ───────────────────────────────────────────────────────────────
  { pattern: /green p\b|greenp\b/i,                                   category: 'Parking' },
  { pattern: /precise park|parklink/i,                                category: 'Parking' },
  { pattern: /\bimpark\b/i,                                           category: 'Parking' },
  { pattern: /\bindigo\b.*park|parking.*indigo/i,                     category: 'Parking' },
  { pattern: /sp\+\b|sp plus|lafleur\b/i,                             category: 'Parking' },
  { pattern: /\bparking\b/i,                                          category: 'Parking' },

  // ── Streaming ─────────────────────────────────────────────────────────────
  { pattern: /netflix/i,                                              category: 'Streaming' },
  { pattern: /spotify/i,                                              category: 'Streaming' },
  { pattern: /disney\+|disney plus/i,                                 category: 'Streaming' },
  { pattern: /amazon prime|prime video/i,                             category: 'Streaming' },
  { pattern: /apple tv\+|apple tv plus/i,                             category: 'Streaming' },
  { pattern: /\bcrave\b/i,                                            category: 'Streaming' },
  { pattern: /youtube premium/i,                                      category: 'Streaming' },
  { pattern: /hbo max|\bhbo\b/i,                                      category: 'Streaming' },
  { pattern: /apple music/i,                                          category: 'Streaming' },
  { pattern: /tidal\b|deezer\b/i,                                     category: 'Streaming' },

  // ── Internet ──────────────────────────────────────────────────────────────
  { pattern: /teksavvy/i,                                             category: 'Internet' },
  { pattern: /cogeco/i,                                               category: 'Internet' },
  { pattern: /distributel/i,                                          category: 'Internet' },
  { pattern: /start\.ca|startca/i,                                    category: 'Internet' },

  // ── Phone ─────────────────────────────────────────────────────────────────
  { pattern: /\bfido\b/i,                                             category: 'Phone' },
  { pattern: /\bkoodo\b/i,                                            category: 'Phone' },
  { pattern: /virgin\s*(mobile|plus)/i,                               category: 'Phone' },
  { pattern: /\bwind\b.*mobile|freedom mobile/i,                      category: 'Phone' },
  { pattern: /public mobile/i,                                        category: 'Phone' },
  { pattern: /\bchtr\b|chatr\b/i,                                     category: 'Phone' },

  // Rogers + Bell + Telus can be phone OR internet — put generic at end
  { pattern: /\brogers\b/i,                                           category: 'Phone' },
  { pattern: /\bbell\b(?!.*aliant)/i,                                 category: 'Phone' },
  { pattern: /\btelus\b/i,                                            category: 'Phone' },

  // ── Hydro / Utilities ─────────────────────────────────────────────────────
  { pattern: /enwave/i,                                               category: 'Hydro' },
  { pattern: /hydro one/i,                                            category: 'Hydro' },
  { pattern: /toronto hydro/i,                                        category: 'Hydro' },
  { pattern: /alectra/i,                                              category: 'Hydro' },
  { pattern: /enbridge\b/i,                                           category: 'Hydro' },
  { pattern: /union gas/i,                                            category: 'Hydro' },
  { pattern: /energy\b.*utility|utility.*\benergy/i,                  category: 'Hydro' },

  // ── Pharmacy ──────────────────────────────────────────────────────────────
  { pattern: /shoppers drug mart|shoppers\b/i,                        category: 'Pharmacy' },
  { pattern: /\brexall\b/i,                                           category: 'Pharmacy' },
  { pattern: /london drugs/i,                                         category: 'Pharmacy' },
  { pattern: /pharmasave/i,                                           category: 'Pharmacy' },
  { pattern: /guardian\s*pharmacy|medicine shoppe/i,                  category: 'Pharmacy' },
  { pattern: /\bpharmacy\b|\bpharmacies\b/i,                          category: 'Pharmacy' },
  { pattern: /\bdrugstore\b/i,                                        category: 'Pharmacy' },

  // ── Health ────────────────────────────────────────────────────────────────
  { pattern: /\bclinic\b|medical centre/i,                            category: 'Health' },
  { pattern: /dentist|dental\b/i,                                     category: 'Health' },
  { pattern: /physiotherapy|physio\b/i,                               category: 'Health' },
  { pattern: /optometrist|eye care|vision\s*centre/i,                 category: 'Health' },
  { pattern: /massage therapy|registered massage/i,                   category: 'Health' },
  { pattern: /chiropract/i,                                           category: 'Health' },
  { pattern: /naturopath/i,                                           category: 'Health' },
  { pattern: /psycholog|therapist|counsell/i,                         category: 'Health' },

  // ── Gym ───────────────────────────────────────────────────────────────────
  { pattern: /goodlife/i,                                             category: 'Gym' },
  { pattern: /planet fitness/i,                                       category: 'Gym' },
  { pattern: /anytime fitness/i,                                      category: 'Gym' },
  { pattern: /\bymca\b/i,                                             category: 'Gym' },
  { pattern: /crossfit/i,                                             category: 'Gym' },
  { pattern: /equinox\b/i,                                            category: 'Gym' },
  { pattern: /\bgym\b|fitness.*club|health.*club/i,                   category: 'Gym' },

  // ── Clothing ──────────────────────────────────────────────────────────────
  { pattern: /\bwinners\b/i,                                          category: 'Clothing' },
  { pattern: /homesense/i,                                            category: 'Clothing' },
  { pattern: /\bh&m\b|h and m\b/i,                                    category: 'Clothing' },
  { pattern: /\bzara\b/i,                                             category: 'Clothing' },
  { pattern: /\bgap\b/i,                                              category: 'Clothing' },
  { pattern: /old navy/i,                                             category: 'Clothing' },
  { pattern: /banana republic/i,                                      category: 'Clothing' },
  { pattern: /aritzia/i,                                              category: 'Clothing' },
  { pattern: /lululemon|lulu lemon/i,                                 category: 'Clothing' },
  { pattern: /roots\b/i,                                              category: 'Clothing' },
  { pattern: /reitmans|addition elle/i,                               category: 'Clothing' },
  { pattern: /sport chek/i,                                           category: 'Clothing' },
  { pattern: /nike\b|adidas\b|under armour/i,                         category: 'Clothing' },

  // ── Entertainment ─────────────────────────────────────────────────────────
  { pattern: /cineplex|landmark cinema/i,                             category: 'Entertainment' },
  { pattern: /ticketmaster|eventbrite/i,                              category: 'Entertainment' },
  { pattern: /\bmlse\b|air canada centre|scotiabank arena/i,          category: 'Entertainment' },
  { pattern: /live nation/i,                                          category: 'Entertainment' },
  { pattern: /steam\b|epic games|playstation|xbox\b/i,                category: 'Entertainment' },
  { pattern: /apple\s*arcade|google play/i,                           category: 'Entertainment' },

  // ── Travel ────────────────────────────────────────────────────────────────
  { pattern: /\bua\s+inflt\b|\bua inflight\b/i,                       category: 'Travel' },  // United Airlines in-flight
  { pattern: /trip\.com/i,                                            category: 'Travel' },
  { pattern: /air canada/i,                                           category: 'Travel' },
  { pattern: /westjet/i,                                              category: 'Travel' },
  { pattern: /porter\s*airlines/i,                                    category: 'Travel' },
  { pattern: /\bairbnb\b/i,                                           category: 'Travel' },
  { pattern: /marriott|hilton|hyatt|sheraton|westin|holiday inn/i,    category: 'Travel' },
  { pattern: /expedia|hotels\.com|booking\.com|trivago/i,             category: 'Travel' },

  // ── Home Maintenance ──────────────────────────────────────────────────────
  { pattern: /home depot/i,                                           category: 'Home Maintenance' },
  { pattern: /\brona\b/i,                                             category: 'Home Maintenance' },
  { pattern: /\blowe.s\b/i,                                           category: 'Home Maintenance' },
  { pattern: /canadian tire(?!.*gas)/i,                               category: 'Home Maintenance' },
  { pattern: /\bikea\b/i,                                             category: 'Home Maintenance' },
  { pattern: /wayfair/i,                                              category: 'Home Maintenance' },
  { pattern: /plumber|electrician|contractor|renovati/i,              category: 'Home Maintenance' },

  // ── Car Maintenance ───────────────────────────────────────────────────────
  { pattern: /jiffy lube|oil change|midas\b|mr lube/i,                category: 'Car Maintenance' },
  { pattern: /\bauto.*repair|car.*wash|tire.*shop/i,                  category: 'Car Maintenance' },

  // ── Property Tax ──────────────────────────────────────────────────────────
  { pattern: /property tax|municipal tax/i,                           category: 'Property Tax' },

  // ── Mortgage / HELOC ──────────────────────────────────────────────────────
  { pattern: /mortgage\b/i,                                           category: 'Mortgage' },
  { pattern: /\bheloc\b|home equity line/i,                           category: 'HELOC' },
]

// ── Pass 1: synchronous keyword lookup ────────────────────────────────────────

export function lookupCategory(merchant: string): Category | null {
  for (const { pattern, category } of LOOKUP) {
    if (pattern.test(merchant)) return category
  }
  return null
}

// ── Pass 2: Claude API batch for unknowns ──────────────────────────────────────

async function categorizeBatch(
  merchants: string[],
): Promise<Record<number, Category>> {
  if (merchants.length === 0) return {}

  const client = new Anthropic()

  const categoryList = CATEGORIES.join(', ')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: `You categorize Canadian credit card transaction merchant names.
Valid categories: ${categoryList}

Respond with ONLY a JSON array (no markdown, no explanation) where each element is one valid category string, in the same order as the input merchants.
Example input:  ["TIM HORTONS #123", "NETFLIX.COM"]
Example output: ["Coffee", "Streaming"]

Pick the closest match — avoid "Other" unless truly uncategorizable.`,
    messages: [{
      role: 'user',
      content: JSON.stringify(merchants),
    }],
  })

  const raw = response.content.find(b => b.type === 'text')?.text?.trim() ?? ''

  // Extract the JSON array even if the model wraps it in markdown fences
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    console.error('[categorize] No JSON array found in response:', raw)
    return {}
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    console.error('[categorize] Failed to parse Claude response:', raw)
    return {}
  }

  if (!Array.isArray(parsed)) {
    console.error('[categorize] Expected array, got:', typeof parsed)
    return {}
  }

  const result: Record<number, Category> = {}
  parsed.forEach((cat, i) => {
    if (typeof cat === 'string' && (CATEGORIES as readonly string[]).includes(cat)) {
      result[i] = cat as Category
    }
  })
  return result
}

// ── Main entry point ───────────────────────────────────────────────────────────

/**
 * Categorize an array of merchant names.
 * Pass 0: DB history  — exact merchant match from past transactions (caller supplies map)
 * Pass 1: keyword lookup (instant regex)
 * Pass 2: Claude API for anything not matched
 * Returns a category string for each input merchant, in the same order.
 *
 * @param merchants        List of merchant name strings to categorize
 * @param knownCategories  Optional map of merchant → category from existing DB records
 */
export async function categorizeAll(
  merchants: string[],
  knownCategories: Record<string, Category> = {},
): Promise<Category[]> {
  // Pass 0: DB history
  const results: (Category | null)[] = merchants.map(m => knownCategories[m] ?? null)

  // Pass 1: keyword lookup for anything still unresolved
  results.forEach((r, i) => {
    if (r === null) results[i] = lookupCategory(merchants[i])
  })

  // Collect indices that still need AI categorization
  const unknownIndices: number[] = []
  const unknownMerchants: string[] = []
  results.forEach((r, i) => {
    if (r === null) {
      unknownIndices.push(i)
      unknownMerchants.push(merchants[i])
    }
  })

  if (unknownMerchants.length > 0) {
    try {
      const aiResults = await categorizeBatch(unknownMerchants)
      unknownIndices.forEach((origIndex, batchIndex) => {
        if (aiResults[batchIndex] !== undefined) {
          results[origIndex] = aiResults[batchIndex]
        }
      })
    } catch (err) {
      console.error('[categorize] Claude API error — falling back to Other:', err)
    }
  }

  return results.map(r => r ?? 'Other')
}
