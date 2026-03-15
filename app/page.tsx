export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-100 mb-2">fin</h1>
        <p className="text-gray-500 mb-8">Joint finance tracker — Shirley & Johnson</p>

        <div className="grid grid-cols-2 gap-4">
          {[
            { href: '/transactions', title: 'Transactions',      desc: 'Review and categorize' },
            { href: '/upload',       title: 'Upload Statements', desc: 'Import PDFs and CSVs' },
            { href: '/reports',      title: 'Reports',           desc: 'Monthly and annual summaries' },
            { href: '/settings',     title: 'Settings',          desc: 'Split ratios and categories' },
          ].map(link => (
            <a
              key={link.href}
              href={link.href}
              className="block p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-blue-500 transition-colors"
            >
              <h2 className="font-semibold text-gray-100 mb-1">{link.title}</h2>
              <p className="text-sm text-gray-500">{link.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
