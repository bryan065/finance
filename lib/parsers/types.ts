// Represents a single parsed transaction row before it is saved to the DB.
// category and type are left as defaults here — the user sets them
// on the Transactions page after import.

export type ParsedRow = {
  date: string              // YYYY-MM-DD
  merchant: string
  amount: number            // always positive (payments filtered out)
  paidBy: 'Shirley' | 'Johnson'
}
