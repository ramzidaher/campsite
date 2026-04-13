alter table public.profiles
  drop constraint if exists profiles_celebration_mode_check;

alter table public.profiles
  add constraint profiles_celebration_mode_check
  check (
    celebration_mode in (
      'off',
      'pride',
      'new_years_day',
      'valentines_day',
      'international_womens_day',
      'earth_day',
      'christmas',
      'easter',
      'good_friday',
      'palm_sunday',
      'hanukkah',
      'passover',
      'rosh_hashanah',
      'yom_kippur',
      'eid_al_fitr',
      'eid_al_adha',
      'ramadan',
      'diwali',
      'holi',
      'lunar_new_year',
      'vesak',
      'halloween',
      'thanksgiving',
      'black_friday',
      'mothers_day',
      'fathers_day',
      'boxing_day',
      'bonfire_night',
      'early_may_bank_holiday'
    )
  );
