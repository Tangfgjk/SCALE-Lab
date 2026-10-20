ALTER TABLE member_revisions DROP CONSTRAINT member_revisions_category_check;
ALTER TABLE member_revisions ADD CONSTRAINT member_revisions_category_check
  CHECK (category IN ('advisor','researcher','postdoc','student','alumni'));
