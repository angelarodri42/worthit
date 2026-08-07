"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { Search, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"

type Unit = "g" | "kg" | "ml" | "l" | "stk"
type Kind = "weight" | "volume" | "count"

const UNIT_META: Record<Unit, { factor: number; kind: Kind }> = {
  g: { factor: 1, kind: "weight" },
  kg: { factor: 1000, kind: "weight" },
  ml: { factor: 1, kind: "volume" },
  l: { factor: 1000, kind: "volume" },
  stk: { factor: 1, kind: "count" },
}

const UNITS = Object.keys(UNIT_META) as Unit[]

// Reference label shown next to the computed unit price for each kind.
const REF_LABEL: Record<Kind, string> = {
  weight: "100 g",
  volume: "100 ml",
  count: "stk",
}

type Entry = {
  id: string
  product: string
  price: number
  amount: number
  unit: Unit
  // Normalised comparison value: price per 100 g / 100 ml, or price per piece.
  unitPrice: number
  kind: Kind
  date: number
}

type Verdict = "cheap" | "average" | "expensive"


async function loadEntries(): Promise<Entry[]> {
  const { data, error } = await supabase
    .from("prices")
    .select("*")
    .order("date", { ascending: false })

  if (error) {
    console.error("Error loading entries:", error)
    return []
  }

  return data.map((item) => ({
    id: item.id,
    product: item.product,
    price: item.price,
    amount: item.amount,
    unit: item.unit,
    unitPrice: item.unit_price,
    kind: item.kind,
    date: new Date(item.date).getTime(),
  }))
}

function formatMoney(n: number) {
  return n.toLocaleString("da-DK", {
    style: "currency",
    currency: "DKK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Normalise a price + amount + unit into a comparable unit price.
function computeUnitPrice(price: number, amount: number, unit: Unit) {
  const { factor, kind } = UNIT_META[unit]
  const base = amount * factor
  if (!(base > 0)) return null
  // weight & volume -> per 100 base units; count -> per single piece
  return kind === "count" ? price / base : (price / base) * 100
}

export function PriceTracker() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [product, setProduct] = useState("")
  const [price, setPrice] = useState("")
  const [amount, setAmount] = useState("")
  const [unit, setUnit] = useState<Unit>("g")

  useEffect(() => {
    
    loadEntries().then(setEntries)
  }, [])


  const kind = UNIT_META[unit].kind
  const refLabel = REF_LABEL[kind]

  const priceNum = Number.parseFloat(price)
  const amountNum = Number.parseFloat(amount)
  const unitPrice =
    Number.isFinite(priceNum) && Number.isFinite(amountNum)
      ? computeUnitPrice(priceNum, amountNum, unit)
      : null

  // History for the currently typed product, restricted to the same kind so
  // weight, volume and count prices are never compared against each other.
  const history = useMemo(() => {
    const key = product.trim().toLowerCase()
    if (!key) return []
    return entries
      .filter((e) => e.product.toLowerCase() === key && e.kind === kind)
      .sort((a, b) => b.date - a.date)
  }, [entries, product, kind])

  const stats = useMemo(() => {
    if (history.length === 0) return null
    const values = history.map((h) => h.unitPrice)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const avg = values.reduce((s, v) => s + v, 0) / values.length
    return { min, max, avg }
  }, [history])

  const verdict: Verdict | null = useMemo(() => {
    if (unitPrice == null || !stats) return null
    if (unitPrice <= stats.avg * 0.95) return "cheap"
    if (unitPrice >= stats.avg * 1.05) return "expensive"
    return "average"
  }, [unitPrice, stats])

  // Position of the current price along the [min, max] range, 0..1.
  const position = useMemo(() => {
    if (unitPrice == null || !stats) return null
    const { min, max } = stats
    if (max === min) return 0.5
    const clamped = Math.min(Math.max(unitPrice, min), max)
    return (clamped - min) / (max - min)
  }, [unitPrice, stats])

  const canSave =
    product.trim().length > 0 && unitPrice != null && Number.isFinite(unitPrice)

  async function handleSave(e: React.FormEvent) {
  e.preventDefault()
  if (!canSave || unitPrice == null) return

  const entry: Entry = {
    id: crypto.randomUUID(),
    product: product.trim(),
    price: priceNum,
    amount: amountNum,
    unit,
    unitPrice,
    kind,
    date: Date.now(),
  }

  const { error } = await supabase
  .from("prices")
  .insert({
    id: entry.id,
    product: entry.product,
    price: entry.price,
    amount: entry.amount,
    unit: entry.unit,
    unit_price: entry.unitPrice,
    kind: entry.kind,
    date: new Date(entry.date).toISOString(),
  })

  if (error) {
  console.log("SUPABASE ERROR:", error)
  return
}

  setEntries((prev) => [entry, ...prev])

  setPrice("")
  setAmount("")
}

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Worth It
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find the true price per {refLabel}
        </p>
      </header>

      {/* Search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="text"
          inputMode="text"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="Search a product…"
          aria-label="Product name"
          className="h-14 w-full rounded-2xl border border-border bg-card pl-12 pr-4 text-base text-card-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25"
        />
      </div>

      {/* Inputs */}
      <form onSubmit={handleSave} className="mt-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="pl-1 text-xs font-medium text-muted-foreground">
              Price
            </span>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0,00"
                aria-label="Price in Danish kroner"
                className="h-14 w-full rounded-2xl border border-border bg-card pl-4 pr-12 text-base tabular-nums text-card-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-medium text-muted-foreground">
                kr
              </span>
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="pl-1 text-xs font-medium text-muted-foreground">
              Amount
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              aria-label="Amount"
              className="h-14 w-full rounded-2xl border border-border bg-card px-4 text-base tabular-nums text-card-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>
        </div>

        {/* Unit selector */}
        <fieldset className="mt-3">
          <legend className="sr-only">Unit</legend>
          <div className="grid grid-cols-5 gap-2">
            {UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                aria-pressed={unit === u}
                className={cn(
                  "h-10 rounded-xl border text-sm font-medium tabular-nums transition-colors",
                  unit === u
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Result card */}
        <ResultCard
          unitPrice={unitPrice}
          refLabel={refLabel}
          verdict={verdict}
          position={position}
          stats={stats}
          hasHistory={history.length > 0}
        />

        <button
          type="submit"
          disabled={!canSave}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="size-5" aria-hidden="true" />
          Save this price
        </button>
      </form>

      {/* History */}
      {history.length > 0 && (
        <section className="mt-8" aria-label="Price history">
          <h2 className="mb-3 pl-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {product.trim()} · history
          </h2>
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold tabular-nums text-card-foreground">
                    {formatMoney(h.unitPrice)}
                    <span className="text-muted-foreground">
                      {" "}
                      /{REF_LABEL[h.kind]}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatMoney(h.price)} · {h.amount}
                    {h.unit}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeEntry(h.id)}
                  aria-label="Delete entry"
                  className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const VERDICT_META: Record<
  Verdict,
  { label: string; text: string; dot: string }
> = {
  cheap: {
    label: "Cheaper than usual",
    text: "text-cheap",
    dot: "bg-cheap",
  },
  average: {
    label: "About average",
    text: "text-average",
    dot: "bg-average",
  },
  expensive: {
    label: "More expensive",
    text: "text-expensive",
    dot: "bg-expensive",
  },
}

function ResultCard({
  unitPrice,
  refLabel,
  verdict,
  position,
  stats,
  hasHistory,
}: {
  unitPrice: number | null
  refLabel: string
  verdict: Verdict | null
  position: number | null
  stats: { min: number; max: number; avg: number } | null
  hasHistory: boolean
}) {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-end justify-between">
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Price per {refLabel}
          </span>
          <div className="mt-0.5 text-4xl font-semibold tabular-nums tracking-tight text-card-foreground">
            {unitPrice == null ? (
              <span className="text-muted-foreground/50">—</span>
            ) : (
              formatMoney(unitPrice)
            )}
          </div>
        </div>
        {verdict && (
          <div
            className={cn(
              "flex items-center gap-1.5 text-sm font-semibold",
              VERDICT_META[verdict].text,
            )}
          >
            <span
              className={cn("size-2 rounded-full", VERDICT_META[verdict].dot)}
              aria-hidden="true"
            />
            {VERDICT_META[verdict].label}
          </div>
        )}
      </div>

      {/* Comparison bar */}
      <div className="mt-5">
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-[linear-gradient(90deg,var(--cheap),var(--average),var(--expensive))]">
          {/* dim the bar when there is nothing to compare */}
          {!hasHistory && (
            <div className="absolute inset-0 rounded-full bg-card/70" />
          )}
        </div>

        {position != null && hasHistory ? (
          <div className="relative h-0">
            <div
              className="absolute -top-[15px] flex -translate-x-1/2 flex-col items-center transition-[left] duration-300 ease-out"
              style={{ left: `${position * 100}%` }}
            >
              <span className="size-5 rounded-full border-4 border-card bg-foreground shadow-md" />
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex justify-between text-xs tabular-nums text-muted-foreground">
          {hasHistory && stats ? (
            <>
              <span>lowest {formatMoney(stats.min)}</span>
              <span>highest {formatMoney(stats.max)}</span>
            </>
          ) : (
            <span className="text-muted-foreground/70">
              Save a price to start comparing
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
