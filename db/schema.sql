-- Kargo hiring dashboard schema. The app runs this automatically on first request;
-- this file is for reference / manual setup.

create table if not exists rubric_criteria (
  id bigserial primary key,
  role text not null check (role in ('PM','SPM')),
  position int not null,
  name text not null,
  description text not null,
  weight numeric not null,
  unique (role, position)
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  file_name text,
  applied_role text not null check (applied_role in ('PM','SPM')),
  personal jsonb not null default '{}'::jsonb,
  cv_content text,
  scores jsonb,
  pm_score numeric,
  spm_score numeric,
  status text not null default 'new',
  error text,
  brief text,
  email_type text,
  email_subject text,
  email_body text,
  sent_at timestamptz,
  draft_method text
);

alter table candidates add column if not exists draft_method text;

-- personal = name/email/phone (never sent to AI after extraction); cv_content = redacted CV text

delete from rubric_criteria;
insert into rubric_criteria (role, position, name, description, weight) values ('PM', 1, 'Did the operational work firsthand', 'Has personally done the day-to-day work of an operations team (handled shipment documents, cleared customs holds, coordinated carriers, resolved delivery exceptions) as their own job, not as a consultant, interviewer or analyst watching others. A strong CV names specific documents, counterparties or volumes they handled (e.g. "200+ shipments monthly", "coordinated with CHA and customs overnight"). Weak: operations appear only as "user research", "discovery calls" or domain words in the summary.', 25);
insert into rubric_criteria (role, position, name, description, weight) values ('PM', 2, 'Built something unprompted that others adopted', 'Spotted a problem in their own team, built a fix nobody assigned (a tool, tracker, checklist or process), and gives evidence that other people chose to use it: a number of users, teams that adopted it, or a usage change. Weak: counts of features shipped, documents written or talks given, with no evidence anyone used them.', 25);
insert into rubric_criteria (role, position, name, description, weight) values ('PM', 3, 'Killed or failed, and wrote down why', 'Names at least one thing they stopped, lost or got wrong, states what the evidence showed, and says what changed as a result (e.g. "killed 2 features after low adoption, moved the capacity to X, which got 3x usage"). Weak: every bullet is a win, or failure appears only as an abstract lesson.', 20);
insert into rubric_criteria (role, position, name, description, weight) values ('PM', 4, 'No layer between them and the user', 'Worked directly with the people using the product or service and made the call themselves (sole owner of an area, no manager or product layer relaying requirements). A strong CV says who they dealt with directly. Weak: works through account managers, a larger PM team, or approval committees.', 15);
insert into rubric_criteria (role, position, name, description, weight) values ('PM', 5, 'Fixed it personally under time pressure', 'Describes a specific breakdown (a customs hold, a vendor format change, an outage, a failed migration) that they personally resolved against a clock, with the outcome stated. Weak: pressure described only as "fast-paced environment".', 15);
insert into rubric_criteria (role, position, name, description, weight) values ('SPM', 1, 'Did the operational work firsthand', 'Everything in the PM version, plus the operational experience directly shaped a product or system decision they later made (e.g. ops knowledge of port or customs systems led them to prioritise a specific integration). Weak: ops experience that sits unrelated to their product work.', 20);
insert into rubric_criteria (role, position, name, description, weight) values ('SPM', 2, 'Built something unprompted that others adopted', 'Started something without being asked that became part of the core product or the organisation''s standard way of working, used beyond their own team. Weak: adoption limited to their own immediate team, or built only when assigned.', 15);
insert into rubric_criteria (role, position, name, description, weight) values ('SPM', 3, 'Killed or failed, and wrote down why', 'Made and owned a call with lasting consequences that turned out wrong or was reversed (a failed integration, a vendor choice, an architecture choice), and names the lasting change they made afterwards (a new standard, a process or a practice others now follow). Weak: only feature-level kills, or failures blamed on others.', 20);
insert into rubric_criteria (role, position, name, description, weight) values ('SPM', 4, 'No layer between them and the user', 'Was the final decision-maker for a product area or function with no senior PM, VP or committee reviewing their calls, for a sustained period, and says so explicitly. Weak: the title says Senior or Head of, but the CV shows roadmaps reviewed by a VP, long approval cycles, or shared ownership.', 30);
insert into rubric_criteria (role, position, name, description, weight) values ('SPM', 5, 'Fixed it personally under time pressure', 'Led resolution of a breakdown that affected customers or revenue (a migration, a major outage, a data-quality failure) and changed the system so it did not recur (e.g. an on-call rotation that cut P1 incidents by 40%). Weak: a one-off fix with no systemic change.', 15);
