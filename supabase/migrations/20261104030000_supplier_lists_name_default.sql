-- "Yeniden oku" hatası: liste zaten varken kayıt firma adı gönderilmeden yapılır (kullanıcının verdiği ad korunsun diye).
-- Upsert önce eklemeyi dener; name sütununun varsayılanı olmadığı için "null value in column name" hatası çıkıyordu.
-- Varsayılan '' ile ekleme denemesi geçer, çakışmada yalnız gönderilen sütunlar güncellenir (ad korunur).
alter table public.supplier_lists alter column name set default '';
