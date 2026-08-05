// Senarai placeholder yang boleh diguna dalam borang mesej harian.
// Setiap token dipetakan dari medan lead dalam pangkalan data.
export type MessagePlaceholder = {
  token: string;
  label: string;
  column: string;
  example: string;
};

export const MESSAGE_PLACEHOLDERS: MessagePlaceholder[] = [
  { token: "{{nama}}", label: "Nama lead", column: "leads.name", example: "Ahmad" },
  { token: "{{telefon}}", label: "No. telefon", column: "leads.phone", example: "60123456789" },
  { token: "{{produk}}", label: "Produk", column: "leads.product", example: "ACS Legacy" },
  { token: "{{model_kereta}}", label: "Model kereta", column: "leads.car_model", example: "Myvi 1.5" },
  {
    token: "{{nama_whatsapp}}",
    label: "Nama WhatsApp",
    column: "leads.whatsapp_name",
    example: "Ahmad Zaki",
  },
  { token: "{{nota}}", label: "Nota", column: "leads.notes", example: "Minat pakej premium" },
  {
    token: "{{jenis_lead}}",
    label: "Jenis lead",
    column: "leads.lead_type",
    example: "prospect / converted",
  },
];
