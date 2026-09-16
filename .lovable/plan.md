# Dashboard Utama dan Event Blast Harian

## Ringkasan
- Tukar nama menu sidebar **Lead Management** kepada **Dashboard Utama** tanpa menukar fungsi atau alamat halaman sedia ada.
- Tambah tab **Event Hari Ini** pada Dashboard Utama untuk memantau mesej followup automatik yang dijadualkan dan telah diproses pada hari semasa.
- Kekalkan tab Graf, Senarai Lead, dan WhatsApp Followup sedia ada.

## Paparan Event Hari Ini
- Kad statistik untuk jumlah dijadualkan hari ini, berjaya dihantar, masih menunggu, dan gagal.
- Dua statistik tambahan yang sesuai: kadar kejayaan penghantaran dan jumlah nombor penerima unik.
- Paparkan **Next Blast** dengan masa, nama penerima, nombor telefon, hari followup, dan sender yang akan digunakan.
- Jadual rekod harian yang mesra telefon dengan butiran penerima, nombor, sender, waktu dijadualkan, waktu dihantar, hari followup, dan status.
- Status berwarna bagi Pending, Sent, Failed, dan Cancelled serta keadaan kosong/loading yang jelas.
- Data diperbaharui secara berkala supaya rekod berubah selepas automation memproses mesej.

## Data dan Keselamatan
- Tambah satu fungsi bacaan yang memerlukan pengguna log masuk dan menggunakan akses staf/admin sedia ada.
- Ambil rekod berdasarkan timezone scheduler **Asia/Kuala_Lumpur**, bukan timezone peranti pengguna.
- Rekod event datang terus daripada jadual followup yang dijana apabila lead aktif ditambah; tiada jadual atau data demo baharu dicipta.

## Teknikal
- Kemas kini metadata halaman Dashboard Utama.
- Gunakan komponen dan warna sedia ada supaya paparan konsisten dan responsif pada desktop serta mobile.
- Sahkan paparan melalui semakan binaan dan ujian halaman pada saiz telefon.
