-- Adicionar coluna username na tabela profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- Criar índice único case-insensitive
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON profiles (LOWER(username));

-- Gerar username para usuários existentes sem username, baseado na parte local do email
-- Usa um sufixo numérico para garantir unicidade em caso de prefixos duplicados
WITH ranked AS (
  SELECT id, email,
    LOWER(SPLIT_PART(email, '@', 1)) AS base_username,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(SPLIT_PART(email, '@', 1))
      ORDER BY created_at
    ) AS rn
  FROM profiles
  WHERE username IS NULL OR username = ''
)
UPDATE profiles
SET username = CASE WHEN ranked.rn = 1 THEN ranked.base_username
                    ELSE ranked.base_username || ranked.rn::TEXT
               END
FROM ranked
WHERE profiles.id = ranked.id;
