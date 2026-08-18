import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";

type Incident = {
  id: string;
  source_case_number: number;
  category: string;
  event_date: string | null;
  source_date_raw: string;
  title: string | null;
  topics: string[];
  topic_confidence: number;
  source_page_start: number;
  source_page_end: number;
  raw_text: string;
  people: string[];
  needs_review: boolean;
};

type Manifest = { pages: number; records: number; people_candidates: number; review_queue_count: number };
type View = "archive" | "timeline";

const categoryInfo: Record<string, { short: string; description: string }> = {
  Nulla: { short: "N", description: "Elhallgatott hír" },
  Parancs: { short: "P", description: "Parancsra készített hír" },
  Kuka: { short: "K", description: "Kidobott hír" },
  Elutasítva: { short: "E", description: "Elutasított hírjavaslat" },
  Hárítás: { short: "H", description: "Hárított manipuláció" },
  Manipuláció: { short: "M", description: "Álcázott közlemény" },
  Utasítás: { short: "U", description: "Szerkesztői utasítás" },
  Késleltetve: { short: "KÉ", description: "Késleltetett anyag" },
  "Fake news": { short: "FN", description: "Hamis hír vagy tudósítás" },
  Cenzúra: { short: "C", description: "Indokolatlan húzás" },
};

const categories = Object.keys(categoryInfo);
const huDate = new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric" });
const displayDate = (item: Incident) => item.event_date ? huDate.format(new Date(`${item.event_date}T12:00:00`)) : item.source_date_raw || "Dátum nélkül";
const excerpt = (text: string, length = 240) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length).trim()}…` : clean;
};

function App() {
  const [records, setRecords] = useState<Incident[]>([]);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("archive");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Összes");
  const [topic, setTopic] = useState("Összes");
  const [year, setYear] = useState("Összes");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [visible, setVisible] = useState(24);
  const [selected, setSelected] = useState<Incident | null>(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    Promise.all([
      fetch(`${base}data/records.json`).then(response => {
        if (!response.ok) throw new Error("A rekordok nem tölthetők be.");
        return response.json();
      }),
      fetch(`${base}data/manifest.json`).then(response => response.json()),
    ]).then(([items, meta]) => {
      setRecords(items);
      setManifest(meta);
    }).catch(reason => setError(reason.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", close);
    document.body.classList.toggle("modal-open", Boolean(selected));
    return () => { document.removeEventListener("keydown", close); document.body.classList.remove("modal-open"); };
  }, [selected]);

  const topics = useMemo(() => [...new Set(records.flatMap(item => item.topics))].sort((a, b) => a.localeCompare(b, "hu")), [records]);
  const years = useMemo(() => [...new Set(records.flatMap(item => item.event_date ? [item.event_date.slice(0, 4)] : []))].sort().reverse(), [records]);
  const categoryCounts = useMemo(() => Object.fromEntries(categories.map(name => [name, records.filter(item => item.category === name).length])), [records]);

  const filtered = useMemo(() => {
    const needle = query.toLocaleLowerCase("hu").trim();
    return records.filter(item => {
      const searchable = `${item.title ?? ""} ${item.raw_text} ${item.people.join(" ")} ${item.topics.join(" ")}`.toLocaleLowerCase("hu");
      return (!needle || searchable.includes(needle))
        && (category === "Összes" || item.category === category)
        && (topic === "Összes" || item.topics.includes(topic))
        && (year === "Összes" || item.event_date?.startsWith(year));
    }).sort((a, b) => {
      const aDate = a.event_date ?? "0000-00-00";
      const bDate = b.event_date ?? "0000-00-00";
      return sort === "newest" ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
    });
  }, [records, query, category, topic, year, sort]);

  useEffect(() => setVisible(24), [query, category, topic, year, sort]);

  const timelineGroups = useMemo(() => {
    const dated = filtered.filter(item => item.event_date);
    return Object.entries(dated.reduce<Record<string, Incident[]>>((groups, item) => {
      const itemYear = item.event_date!.slice(0, 4);
      (groups[itemYear] ??= []).push(item);
      return groups;
    }, {})).sort(([a], [b]) => sort === "newest" ? b.localeCompare(a) : a.localeCompare(b));
  }, [filtered, sort]);

  const activeFilters = [category, topic, year].filter(value => value !== "Összes").length + Number(Boolean(query));
  const resetFilters = () => { setQuery(""); setCategory("Összes"); setTopic("Összes"); setYear("Összes"); };

  return <div className="site-shell">
    <header className="topbar">
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="Narancs csíkos nyitólap">
        <span className="brand-mark"><i /><i /><i /></span>
        <span>Narancs <em>csíkos</em></span>
      </a>
      <nav aria-label="Oldalnézetek">
        <button className={view === "archive" ? "active" : ""} onClick={() => setView("archive")}>Esettár</button>
        <button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}>Idővonal</button>
      </nav>
      <span className="source-badge">Forrás · mti-400.pdf</span>
    </header>

    <main>
      <section className="hero-new">
        <div className="hero-copy">
          <div className="kicker"><span>PRO DOMO gyűjtemény</span><i />2015–2026</div>
          <h1>Amikor egy hír<br /><em>nem úgy jelenik meg.</em></h1>
          <p>Az állami hírügynökségnél dokumentált szerkesztői döntések, elhallgatások és beavatkozások kereshető, forrásoldalakra visszakövethető archívuma.</p>
        </div>
        <div className="hero-index" aria-label="Archívum összesítése">
          <span className="index-label">ARCHÍVUM / 001</span>
          <strong>{manifest?.records ?? (records.length || "–")}</strong>
          <p>dokumentált eset</p>
          <div className="index-rule"><i /></div>
          <div className="index-mini"><span>{manifest?.pages ?? 483}<small>oldal</small></span><span>{categories.length}<small>kategória</small></span><span>{years.length}<small>év</small></span></div>
        </div>
      </section>

      <section className="category-ribbon" aria-label="Kategóriák">
        {categories.map(name => <button key={name} data-category={name} className={category === name ? "active" : ""} onClick={() => setCategory(category === name ? "Összes" : name)}>
          <span className="category-code">{categoryInfo[name].short}</span>
          <span><b>{name}</b><small>{categoryInfo[name].description}</small></span>
          <strong>{categoryCounts[name] ?? 0}</strong>
        </button>)}
      </section>

      <section className="explorer">
        <div className="section-intro">
          <span className="section-number">01</span>
          <div><p>FELFEDEZÉS</p><h2>Keress az esetek között</h2></div>
          <p className="section-note">A címek és témák algoritmikusan azonosított metaadatok. Minden rekord megőrzi a teljes eredeti szöveget és a PDF oldalszámát.</p>
        </div>

        <div className="filter-panel">
          <label className="search-field"><span>Keresés a teljes szövegben</span><div><i /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Személy, szervezet, ügy vagy kifejezés…" /></div></label>
          <label><span>Téma</span><select value={topic} onChange={event => setTopic(event.target.value)}><option>Összes</option>{topics.map(value => <option key={value}>{value}</option>)}</select></label>
          <label><span>Év</span><select value={year} onChange={event => setYear(event.target.value)}><option>Összes</option>{years.map(value => <option key={value}>{value}</option>)}</select></label>
          <label><span>Sorrend</span><select value={sort} onChange={event => setSort(event.target.value as "newest" | "oldest")}><option value="newest">Legújabb elöl</option><option value="oldest">Legrégebbi elöl</option></select></label>
          <button className="reset-button" onClick={resetFilters} disabled={!activeFilters}>Törlés {activeFilters > 0 && <b>{activeFilters}</b>}</button>
        </div>

        <div className="view-bar">
          <div className="view-tabs" role="tablist"><button role="tab" aria-selected={view === "archive"} className={view === "archive" ? "active" : ""} onClick={() => setView("archive")}><i className="grid-icon" />Esettár</button><button role="tab" aria-selected={view === "timeline"} className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}><i className="line-icon" />Idővonal</button></div>
          <p><strong>{filtered.length}</strong> találat</p>
        </div>

        {loading && <div className="state-message"><i className="loader" />Az archívum betöltése…</div>}
        {error && <div className="state-message error">{error}</div>}

        {!loading && !error && view === "archive" && <>
          <section className="incident-grid">{filtered.slice(0, visible).map((item, index) => <IncidentCard key={item.id} item={item} index={index} onOpen={() => setSelected(item)} />)}</section>
          {filtered.length > visible && <button className="load-more" onClick={() => setVisible(value => value + 24)}>További esetek betöltése <span>{filtered.length - visible}</span></button>}
        </>}

        {!loading && !error && view === "timeline" && <Timeline groups={timelineGroups} onOpen={setSelected} />}
        {!loading && !filtered.length && <div className="state-message empty"><strong>Nincs találat.</strong><span>Próbálj másik kifejezést vagy töröld a szűrőket.</span></div>}
      </section>
    </main>

    <footer><div className="brand footer-brand"><span className="brand-mark"><i /><i /><i /></span><span>Narancs <em>csíkos</em></span></div><p>Dokumentumalapú, kereshető archívum · A forrásban szereplő állítások szerkesztetlenül jelennek meg.</p><a href="#top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Vissza az elejére ↑</a></footer>

    {selected && <IncidentModal item={selected} onClose={() => setSelected(null)} />}
  </div>;
}

function IncidentCard({ item, index, onOpen }: { item: Incident; index: number; onOpen: () => void }) {
  return <article className="incident-card" style={{ "--delay": `${Math.min(index, 12) * 35}ms` } as React.CSSProperties} tabIndex={0} onClick={onOpen} onKeyDown={event => event.key === "Enter" && onOpen()}>
    <div className="card-meta"><span className="category-pill" data-category={item.category}>{item.category}</span><time>{displayDate(item)}</time></div>
    <h3>{item.title ?? "Cím nem azonosítható automatikusan"}</h3>
    <p>{excerpt(item.raw_text)}</p>
    <div className="card-topics">{item.topics.slice(0, 2).map(value => <span key={value}>{value}</span>)}</div>
    <div className="card-footer"><span>#{String(item.source_case_number).padStart(3, "0")}</span><span>PDF {item.source_page_start}{item.source_page_end !== item.source_page_start ? `–${item.source_page_end}` : ""}. oldal</span><b>Megnyitás ↗</b></div>
  </article>;
}

function Timeline({ groups, onOpen }: { groups: [string, Incident[]][]; onOpen: (item: Incident) => void }) {
  if (!groups.length) return <div className="state-message empty"><strong>Nincs dátumozott találat.</strong><span>A dátum nélküli eseteket az Esettár nézetben találod.</span></div>;
  let counter = 0;
  return <section className="timeline-wrap">
    <div className="timeline-heading"><div><span className="section-number">02</span><p>KRONOLÓGIA</p><h2>A döntések idővonala</h2></div><p>A pontok egy-egy dokumentált esetet jelölnek. Kattints a teljes forrásszöveghez.</p></div>
    <div className="timeline-track">
      {groups.map(([year, items]) => <section className="timeline-year" key={year}>
        <header><div className="year-node"><span>{year}</span><small>{items.length} eset</small></div></header>
        <div className="year-events">{items.map(item => {
          const delay = Math.min(counter++, 18) * 45;
          return <button className="timeline-event" key={item.id} style={{ "--delay": `${delay}ms` } as React.CSSProperties} onClick={() => onOpen(item)}>
            <span className="event-node" data-category={item.category} />
            <time>{displayDate(item)}</time>
            <span className="category-pill" data-category={item.category}>{item.category}</span>
            <b>{item.title ?? "Cím nem azonosítható automatikusan"}</b>
            <small>PDF {item.source_page_start}{item.source_page_end !== item.source_page_start ? `–${item.source_page_end}` : ""}. oldal</small>
          </button>;
        })}</div>
      </section>)}
    </div>
  </section>;
}

function IncidentModal({ item, onClose }: { item: Incident; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose} role="presentation"><article className="incident-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={event => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Bezárás">×</button>
    <div className="modal-stripe" data-category={item.category} />
    <div className="modal-header"><div className="modal-kicker"><span className="category-pill" data-category={item.category}>{item.category}</span><time>{displayDate(item)}</time></div><h2 id="modal-title">{item.title ?? "Cím nem azonosítható automatikusan"}</h2><div className="modal-source"><span>Eset #{item.source_case_number}</span><span>mti-400.pdf</span><span>{item.source_page_start}{item.source_page_end !== item.source_page_start ? `–${item.source_page_end}` : ""}. oldal</span></div></div>
    <div className="modal-body"><aside><h3>Témák</h3>{item.topics.map(value => <span className="modal-topic" key={value}>{value}</span>)}{item.people.length > 0 && <><h3>Érintett névjelöltek</h3><p>{item.people.slice(0, 12).join(", ")}</p></>}<div className="confidence"><span>Metaadat-bizalom</span><i><b style={{ width: `${Math.round(item.topic_confidence * 100)}%` }} /></i><strong>{Math.round(item.topic_confidence * 100)}%</strong></div></aside><div className="source-text"><div className="source-text-label">TELJES FORRÁSSZÖVEG</div><pre>{item.raw_text}</pre></div></div>
  </article></div>;
}

createRoot(document.getElementById("root")!).render(<App />);
