-- ============ 004: رمز الطلب تلقائي (يحمي من نسخ JS قديمة في كاش المتصفح) ============
alter table public.orders alter column access_token set default encode(extensions.gen_random_bytes(24), 'hex');
