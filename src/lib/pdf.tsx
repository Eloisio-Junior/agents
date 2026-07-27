import {
  Document,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

// Quote PDF rendering. Validated under Bun (renderToBuffer + PT-BR accents < 500ms; the built-in
// Helvetica font handles Latin-1 so no Font.register / font-path-under-Docker concern). Pure: takes
// already-resolved, PII-bounded data and returns the PDF bytes. The caller renders OUTSIDE any tx
// (CPU-bound) and never lets the lib fetch a remote URL (no <Image src> from user input).

export interface QuoteItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface QuoteRenderData {
  tenantName: string;
  title: string;
  customerName?: string | null;
  currency: string;
  items: QuoteItem[];
  notes?: string | null;
  // ISO date string (already formatted upstream if a locale is needed).
  issuedAt?: string;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, color: "#111827" },
  header: { fontSize: 18, marginBottom: 4 },
  sub: { fontSize: 10, color: "#6b7280", marginBottom: 16 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 4,
  },
  cellDesc: { flex: 4 },
  cellQty: { flex: 1, textAlign: "right" },
  cellPrice: { flex: 2, textAlign: "right" },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderColor: "#111827",
    paddingBottom: 4,
  },
  total: { marginTop: 12, textAlign: "right", fontSize: 13 },
  notes: { marginTop: 20, fontSize: 10, color: "#374151" },
});

function money(value: number, currency: string): string {
  // Plain formatting (no Intl dependency on a server locale): "1299.90 BRL".
  return `${value.toFixed(2)} ${currency}`;
}

// PT-BR labels as constants (not JSX literals) — this is baked PDF content, not translatable UI.
const L = {
  desc: "Descrição",
  qty: "Qtd",
  value: "Valor",
  total: "Total",
};

export async function renderQuotePdf(data: QuoteRenderData): Promise<Buffer> {
  const total = data.items.reduce(
    (acc, i) => acc + i.quantity * i.unitPrice,
    0,
  );
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{data.title}</Text>
        <Text style={styles.sub}>
          {data.tenantName}
          {data.customerName ? ` · ${data.customerName}` : ""}
          {data.issuedAt ? ` · ${data.issuedAt}` : ""}
        </Text>

        <View style={styles.headerRow}>
          <Text style={styles.cellDesc}>{L.desc}</Text>
          <Text style={styles.cellQty}>{L.qty}</Text>
          <Text style={styles.cellPrice}>{L.value}</Text>
        </View>
        {data.items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: render-only list, stable within a single render.
          <View key={i} style={styles.row}>
            <Text style={styles.cellDesc}>{item.description}</Text>
            <Text style={styles.cellQty}>{item.quantity}</Text>
            <Text style={styles.cellPrice}>
              {money(item.quantity * item.unitPrice, data.currency)}
            </Text>
          </View>
        ))}

        <Text style={styles.total}>
          {`${L.total}: ${money(total, data.currency)}`}
        </Text>
        {data.notes ? <Text style={styles.notes}>{data.notes}</Text> : null}
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
