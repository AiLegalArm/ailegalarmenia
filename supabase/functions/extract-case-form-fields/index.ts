import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors } from "../_shared/edge-security.ts";

const COURTS_MAP: Record<string, string> = {
  "\u0544\u0549\u0535\u0534": "\u0544\u0561\u0580\u0564\u0578\u0582 \u056b\u0580\u0561\u057e\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056b \u0565\u057e\u0580\u043e\u043f\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576 (\u0544\u0549\u0535\u0534)",
  "\u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576": "\u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0573\u057c\u0561\u0562\u0565\u056f": "\u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056b\u0561\u056f\u0561\u0576": "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056b\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0580\u0565\u0561\u056f\u0561\u0576": "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u057e\u0561\u0580\u0579\u0561\u056f\u0561\u0576": "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u057e\u0561\u0580\u0579\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u0540\u0561\u056f\u0561\u056f\u0578\u057c\u0578\u0582\u057a\u0581\u056b\u0578\u0576": "\u0540\u0561\u056f\u0561\u056f\u0578\u057c\u0578\u0582\u057a\u0581\u056b\u0578\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0561\u0580\u0579\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576": "\u054e\u0561\u0580\u0579\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u0535\u0580\u0587\u0561\u0576": "\u0535\u0580\u0587\u0561\u0576 \u0584\u0561\u0572\u0561\u0584\u056b \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056b\u0580\u0561\u057e\u0561\u057d\u0578\u0582\u0569\u0575\u0561\u0576 \u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
};

const SYSTEM_PROMPT = `\u0534\u0578\u0582 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u056B \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0572 \u0565\u057D AI Legal Armenia \u0570\u0561\u0574\u0561\u056F\u0561\u0580\u0563\u0578\u0582\u0574 (\u0540\u0540 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0578\u0582\u0576):

\u0551\u0565\u0566 \u057F\u0580\u0561\u0574\u0561\u0564\u0580\u057E\u0578\u0582\u0574 \u0565\u0576 \u0574\u0565\u056F \u056F\u0561\u0574 \u0574\u056B \u0584\u0561\u0576\u056B \u0562\u0565\u057C\u0576\u057E\u0561\u056E \u0586\u0561\u0575\u056C\u0565\u0580\u056B \u057F\u0565\u0584\u057D\u057F\u0565\u0580 (\u0576\u0565\u0580\u0561\u057C\u0575\u0561\u056C OCR):
\u054F\u0565\u0584\u057D\u057F\u0565\u0580\u0568 \u056F\u0561\u0580\u0578\u0572 \u0565\u0576 \u057A\u0561\u0580\u0578\u0582\u0576\u0561\u056F\u0565\u056C \u057F\u0561\u0580\u0562\u0565\u0580 \u0583\u0578\u0582\u056C\u0565\u0580\u056B \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580 (\u0561\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576, \u057E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579, \u057E\u0573\u057C\u0561\u0562\u0565\u056F \u0587 \u0561\u0575\u056C\u0576):

\u0551\u0578 \u056D\u0576\u0564\u056B\u0580\u0576 \u0567\u055D \u057E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0576\u0565\u056C \u056D\u056B\u057D\u057F JSON \u0570\u0565\u057F\u0587\u0575\u0561\u056C \u0564\u0561\u0577\u057F\u0565\u0580\u0578\u057E\u055D
case_number, title, description, case_type, party_role, court_name, current_stage, facts, legal_question.

\u053D\u054B\u054D\u054F \u053F\u0531\u0546\u0548\u0546\u0546\u0535\u0550\u055D

1) \u054E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0580\u0578\u0582 \u0544\u053B\u0531\u0545\u0546 \u057E\u0561\u057E\u0565\u0580 JSON, \u0561\u057C\u0561\u0576\u0581 markdown-\u0583\u0561\u0569\u0565\u0569\u0576\u0565\u0580\u056B:
2) \u0548\u0579\u056B\u0576\u0579 \u0574\u056B \u0570\u0576\u0561\u0580\u056F\u056B\u0580 \u2014 \u0570\u0561\u0576\u056B\u0580 \u0574\u056B\u0561\u0575\u0576 \u0561\u0575\u0576, \u056B\u0576\u0579 \u056F\u0561 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u0578\u0582\u0574:
3) \u0535\u0569\u0565 \u0564\u0561\u0577\u057F\u0568 \u0562\u0561\u0581\u0561\u056F\u0561\u0575\u0578\u0582\u0574 \u0567 \u2014 \u0564\u056B\u0580 null \u056F\u0561\u0574 \u0564\u0561\u057F\u0561\u0580\u056F \u057F\u0578\u0572 "":
4) PII (\u0570\u0561\u057D\u0581\u0565\u0576\u0565\u0580, \u0570\u0565\u057C\u0561\u056D\u0578\u057D\u0576\u0565\u0580, \u0561\u0576\u0571\u0576\u0561\u0563\u0580\u0565\u0580\u056B \u057F\u057E\u0575\u0561\u056C\u0576\u0565\u0580) \u056E\u0561\u056E\u056F\u056B\u0580 "***":
5) description \u2014 3\u20138 \u0576\u0561\u056D\u0561\u0564\u0561\u057D\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u055D \u057E\u0565\u0573\u056B \u0561\u057C\u0561\u0580\u056F\u0561/\u0574\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u0561\u057C\u0561\u0580\u056F\u0561\u0576 + \u0568\u0576\u0564\u0563\u0580\u056F\u057E\u0561\u056E \u0583\u0578\u0582\u056C\u0565\u0580 + \u0570\u056B\u0574\u0576\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E\u0578\u0572\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580 + \u056F\u0561\u0580\u0587\u0578\u0580 \u0569\u057E\u0561\u056F\u0561\u0576\u0576\u0565\u0580:
6) facts \u2014 \u0563\u0578\u0580\u056E\u056B \u0583\u0561\u057D\u057F\u0565\u0580\u0568 \u0570\u0561\u0574\u0561\u0580\u0561\u056F\u057E\u0561\u056E \u0581\u0578\u0582\u0581\u0561\u056F\u0578\u057E (10\u201325 \u056F\u0565\u057F\u0565\u0580\u0578\u057E), \u0575\u0578\u0582\u0580\u0561\u0584\u0561\u0576\u0579\u0575\u0578\u0582\u0580\u0568 \u0576\u0578\u0580 \u057F\u0578\u0572\u056B\u0581\u055D \u0574\u0561\u057D\u0576\u0561\u056F\u056B\u0581\u0576\u0565\u0580, \u056A\u0561\u0574\u056F\u0565\u057F\u0576\u0565\u0580, \u0570\u056B\u0574\u0576\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u0564\u0561\u0580\u0571\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580, \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u0578\u0580\u0578\u0577\u0578\u0582\u0574\u0576\u0565\u0580, \u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056F\u0574\u0561\u0576 \u0561\u057C\u0561\u0580\u056F\u0561, \u0583\u0578\u0582\u056C\u0565\u0580, \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E\u0578\u0572\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580: PII \u056E\u0561\u056E\u056F\u056B\u0580 "***": \u0531\u0574\u0565\u0576 \u0583\u0561\u057D\u057F \u0576\u0578\u0580 \u057F\u0578\u0572\u056B\u0581: \u0535\u0569\u0565 \u0562\u0561\u0581\u0561\u056F\u0561\u0575\u0578\u0582\u0574 \u0567 \u2014 null:
7) legal_question \u2014 \u0563\u0578\u0580\u056E\u056B \u0570\u056B\u0574\u0576\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581\u0568 2\u20135 \u0576\u0561\u056D\u0561\u0564\u0561\u057D\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0578\u057E\u055D \u056B\u0576\u0579 \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u0565\u0580 \u0565\u0576 \u056F\u056B\u0580\u0561\u057C\u057E\u0578\u0582\u0574, \u056B\u0576\u0579 \u057D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576/\u0585\u0580\u0565\u0576\u057D\u0564\u0580\u0561\u056F\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580 \u0565\u0576 \u0561\u057C\u056F\u0561: \u0535\u0569\u0565 \u0562\u0561\u0581\u0561\u056F\u0561\u0575\u0578\u0582\u0574 \u0567 \u2014 null:

\u053F\u0550\u053B\u054F\u053B\u053F\u0531\u053F\u0531\u0546 \u053F\u0531\u0546\u0548\u0546\u055D \u0532\u0548\u053C\u0548\u0550 \u054F\u0535\u0554\u054D\u054F\u0531\u0545\u053B\u0546 \u0534\u0531\u0547\u054F\u0535\u0550\u0538 (title, description) \u054A\u0535\u054F\u0551 \u0537 \u053C\u053B\u0546\u0535\u0546 \u0540\u0531\u0545\u0535\u0550\u0535\u0546\u054A\u053B\u054D:
\u0548\u0552 \u057C\u0578\u0582\u057D\u0565\u0580\u0565\u0576, \u0578\u0579 \u0561\u0576\u0563\u056C\u0565\u0580\u0565\u0576: \u0544\u053B\u0531\u0545\u0546 \u0540\u0531\u0545\u0535\u0550\u0535\u0546:

--------------------------------------------------
current_stage \u0548\u0550\u0548\u0547\u0548\u0552\u0544\u0531\u0546 \u053F\u0531\u0546\u0548\u0546\u0546\u0535\u0550\u055D

\u0553\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u0568 \u056F\u0561\u0580\u0578\u0572 \u0565\u0576 \u0568\u0576\u0564\u0563\u0580\u056F\u0565\u056C \u0562\u0578\u056C\u0578\u0580 \u0583\u0578\u0582\u056C\u0565\u0580\u0568\u055D \u0561\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576\u056B\u0581 \u0574\u056B\u0576\u0579\u0587 \u057E\u0573\u057C\u0561\u0562\u0565\u056F:

\u0531\u056C\u0563\u0578\u0580\u056B\u0569\u0574\u055D

1) \u0545\u0578\u0582\u0580\u0561\u0584\u0561\u0576\u0579\u0575\u0578\u0582\u0580 \u0570\u0561\u057F\u057E\u0561\u056E\u056B \u0570\u0561\u0574\u0561\u0580\u055D
   - doc_date (\u0570\u0561\u0575\u057F\u0561\u0580\u0561\u0580\u0574\u0561\u0576/\u057D\u057F\u0565\u0572\u056E\u0574\u0561\u0576/\u0576\u056B\u057D\u057F\u056B \u0569\u057E\u0561\u056F\u0561\u0576)
   - stage_hint:

      cassation \u2192 "\u054E\u0573\u057C\u0561\u0562\u0565\u056F", "\u056F\u0561\u057D\u0561\u0581\u056B\u0578\u0576"
      appeal \u2192 "\u057E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579", "\u0561\u057A\u0565\u056C\u0575\u0561\u0581\u056B\u0578\u0576"
      first_instance \u2192 "\u0561\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576"
      pretrial \u2192 "\u0584\u0576\u0576\u0579\u0561\u056F\u0561\u0576", "\u0576\u0561\u056D\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576"
      enforcement \u2192 "\u0534\u0531\u0540\u053F"

2) \u0535\u0569\u0565 \u056F\u0561\u0576 \u0569\u057E\u0561\u056F\u0561\u0576\u0576\u0565\u0580\u055D
   current_stage = \u0561\u0574\u0565\u0576\u0561\u0578\u0582\u0577 \u0569\u057E\u0561\u056F\u0561\u0576\u0578\u057E \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u056B \u0583\u0578\u0582\u056C\u0568:

3) \u0535\u0569\u0565 \u0569\u057E\u0561\u056F\u0561\u0576\u0576\u0565\u0580 \u0579\u056F\u0561\u0576\u055D
   cassation > appeal > first_instance > pretrial > enforcement > unknown

4) description-\u0578\u0582\u0574 \u0576\u0577\u056B\u0580\u055D
   "\u0546\u0575\u0578\u0582\u0569\u0565\u0580\u0568 \u0568\u0576\u0564\u0563\u0580\u056F\u0578\u0582\u0574 \u0565\u0576 \u0570\u0565\u057F\u0587\u0575\u0561\u056C \u0583\u0578\u0582\u056C\u0565\u0580\u0568\u055D <\u0569\u057E\u0561\u0580\u056F\u0578\u0582\u0574>:"

\u0539\u0578\u0582\u0575\u056C\u0561\u057F\u0580\u0565\u056C\u056B \u0561\u0580\u056A\u0565\u0584\u0576\u0565\u0580\u055D "pretrial", "first_instance", "appeal", "cassation", "enforcement", "unknown".

--------------------------------------------------

case_type:

criminal \u2192 "\u0584\u0580\u0565\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E", \u0554\u0555, \u0574\u0565\u0572\u0561\u0564\u0580\u0575\u0561\u056C
civil \u2192 "\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E", \u0570\u0561\u0575\u0581, \u057A\u0561\u0570\u0561\u0576\u057B
administrative \u2192 "\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E"

\u0539\u0578\u0582\u0575\u056C\u0561\u057F\u0580\u0565\u056C\u056B \u0561\u0580\u056A\u0565\u0584\u0576\u0565\u0580\u055D "criminal", "civil", "administrative" \u056F\u0561\u0574 null:

--------------------------------------------------

title:

\u053D\u0587\u0561\u0579\u0561\u0583\u055D "<\u0563\u0578\u0580\u056E\u056B \u057F\u0565\u057D\u0561\u056F> \u2014 <\u0561\u057C\u0561\u0580\u056F\u0561> \u2014 <\u0561\u057F\u0575\u0561\u0576>"
\u0555\u0580\u056B\u0576\u0561\u056F\u055D "\u0551\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E \u2014 \u057E\u0576\u0561\u057D\u056B \u0570\u0561\u057F\u0578\u0582\u0581\u0578\u0582\u0574 \u2014 \u057E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579"
\u0531\u057C\u0561\u057E\u0565\u056C\u0561\u0563\u0578\u0582\u0575\u0576\u0568 100 \u0576\u056B\u0577:

--------------------------------------------------

party_role:

lawyer \u2192 \u0565\u0569\u0565 \u056F\u0561\u0576 \u0583\u0561\u057D\u057F\u0561\u0562\u0561\u0576\u056B \u0576\u0565\u0580\u056F\u0561\u0575\u0561\u0581\u0574\u0561\u0576 \u0576\u0577\u0561\u0576\u0576\u0565\u0580
client \u2192 \u0565\u0569\u0565 \u0564\u056B\u0574\u0578\u0572/\u0574\u0565\u0572\u0561\u0564\u0580\u0575\u0561\u056C \u0561\u057C\u0561\u0576\u0581 \u0583\u0561\u057D\u057F\u0561\u0562\u0561\u0576\u056B
auditor \u2192 \u0565\u0569\u0565 \u0561\u0578\u0582\u0564\u056B\u057F/\u057D\u057F\u0578\u0582\u0563\u0578\u0582\u0574
\u0561\u0575\u056C\u0561\u057A\u0565\u057D other

--------------------------------------------------

court_name: \u0534\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u056C\u056B\u0561\u0580\u056A\u0565\u0584 \u057A\u0561\u0577\u057F\u0578\u0576\u0561\u056F\u0561\u0576 \u0570\u0561\u0575\u0565\u0580\u0565\u0576 \u0561\u0576\u057E\u0561\u0576\u0578\u0582\u0574\u0568, \u056B\u0576\u0579\u057A\u0565\u057D \u0576\u0577\u057E\u0561\u056E \u0567 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0578\u0582\u0574:

case_number: \u054A\u0561\u057F\u0565\u057C\u0576\u0576\u0565\u0580\u055D \u053F\u0534/1718/02/24, \u0535\u0531\u0534/1234/01/25, \u053F\u0534-1234-2024, XXXX/NN/NN: \u054E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0580\u0578\u0582 \u0540\u0531\u054D\u054F\u0531\u054F \u0570\u0561\u0574\u0561\u0580\u0568, \u056B\u0576\u0579\u057A\u0565\u057D \u0563\u0580\u057E\u0561\u056E \u0567:`;

interface FileRef {
  bucket: string;
  path: string;
  name: string;
  mime: string;
  size: number;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // User client for auth validation
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !claimsData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.user.id;

    // Service client for Storage download (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceKey);

    // --- Parse body ---
    const { files } = await req.json() as { files?: FileRef[] };
    if (!files || !Array.isArray(files) || files.length === 0) {
      return json({ success: false, error: "No files provided" }, 400);
    }

    // --- Download files from Storage and build multimodal content ---
    const textParts: string[] = [];
    const visionParts: Array<Record<string, unknown>> = [];

    for (const fileRef of files.slice(0, 5)) {
      // Security: verify the file path belongs to the requesting user
      if (!fileRef.path.startsWith(`${userId}/`)) {
        return json({ success: false, error: "Access denied to file: " + fileRef.name }, 403);
      }

      const { data: blob, error: dlError } = await adminClient.storage
        .from(fileRef.bucket)
        .download(fileRef.path);

      if (dlError || !blob) {
        console.error(`Download failed for ${fileRef.name}:`, dlError);
        return json({ success: false, error: `Download failed: ${fileRef.name}` }, 400);
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());

      if (fileRef.mime.startsWith("image/")) {
        // Image → multimodal vision
        const b64 = bytesToBase64(bytes);
        visionParts.push(
          { type: "text", text: `[Изображение: "${fileRef.name}"]` },
          { type: "image_url", image_url: { url: `data:${fileRef.mime};base64,${b64}` } },
        );
      } else if (fileRef.mime === "application/pdf") {
        // PDF → send as image_url with data URI (GPT-5 supports PDF input)
        const b64 = bytesToBase64(bytes);
        visionParts.push(
          { type: "text", text: `[PDF: "${fileRef.name}"]` },
          { type: "image_url", image_url: { url: `data:${fileRef.mime};base64,${b64}` } },
        );
      } else {
        // Text-based files (DOCX, TXT etc.) — decode as text
        try {
          const decoded = new TextDecoder().decode(bytes);
          textParts.push(`--- \u0556\u0561\u0575\u056C: "${fileRef.name}" ---\n${decoded}`);
        } catch {
          console.warn(`Could not decode file ${fileRef.name}`);
        }
      }
    }

    // Build user prompt — apply map-reduce if text is too large
    let filesBlock = textParts.length > 0 ? textParts.join("\n\n") : "";
    
    if (filesBlock.length > 30000) {
      const { mapReduceSummarize } = await import("../_shared/map-reduce-summarizer.ts");
      const mrResult = await mapReduceSummarize(filesBlock);
      if (mrResult.wasReduced) {
        console.log(`Map-Reduce: ${mrResult.originalLength} -> ${mrResult.summary.length} chars`);
        filesBlock = mrResult.summary;
      }
    }
    
    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u056B\u0580 \u0570\u0565\u057F\u0587\u0575\u0561\u056C \u0586\u0561\u0575\u056C\u0565\u0580\u056B \u057F\u0565\u0584\u057D\u057F\u0565\u0580\u0568 \u0587 \u057E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0580\u0578\u0582 JSON \u0568\u057D\u057F \u057D\u056D\u0565\u0574\u0561\u0575\u056B:\n\n<<<FILES_START>>>\n${filesBlock}\n<<<FILES_END>>>`,
      },
      ...visionParts,
    ];

    // --- Call AI ---
    const { callGatewayBypass } = await import("../_shared/gateway-bypass.ts");

    const result = await callGatewayBypass(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      {
        functionName: "extract-case-fields",
        bypassReason: "multimodal",
        timeoutMs: 180000,
      },
    );

    const aiData = result.data;
    const choices = aiData.choices as Array<Record<string, unknown>> | undefined;
    const message = (choices?.[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    const content = (message?.content as string || "").trim();

    let extracted: Record<string, string> = {};
    try {
      let cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      // Find JSON boundaries
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
      try {
        extracted = JSON.parse(cleaned);
      } catch {
        // Attempt to repair truncated JSON by closing unbalanced braces
        let braces = 0;
        for (const ch of cleaned) {
          if (ch === "{") braces++;
          if (ch === "}") braces--;
        }
        let repaired = cleaned;
        while (braces > 0) { repaired += "}"; braces--; }
        extracted = JSON.parse(repaired);
        console.log("[extract] Repaired truncated JSON successfully");
      }
    } catch {
      console.error("Failed to parse AI response:", content.slice(0, 500));
      return json({ success: false, error: "AI response parsing failed" }, 500);
    }

    // Normalize court_name
    if (extracted.court_name) {
      const courtLower = extracted.court_name.toLowerCase();
      for (const [key, value] of Object.entries(COURTS_MAP)) {
        if (courtLower.includes(key.toLowerCase())) {
          extracted.court_name = value;
          break;
        }
      }
    }

    // Validate case_type
    const validTypes = ["criminal", "civil", "administrative"];
    if (!validTypes.includes(extracted.case_type || "")) {
      extracted.case_type = "";
    }

    // Validate stage — map new values and legacy values
    const stageMap: Record<string, string> = {
      preliminary: "pretrial",
      echr: "unknown",
    };
    if (extracted.current_stage && stageMap[extracted.current_stage]) {
      extracted.current_stage = stageMap[extracted.current_stage];
    }
    const validStages = ["pretrial", "first_instance", "appeal", "cassation", "enforcement", "unknown"];
    if (!validStages.includes(extracted.current_stage || "")) {
      extracted.current_stage = "unknown";
    }

    return json({ success: true, fields: extracted });
  } catch (error) {
    console.error("Error in extract-case-form-fields:", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/** Convert Uint8Array to base64 string (Deno-compatible) */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
