-- 预置的邮件模板与找人关键词（不是演示数据，是工作台的出厂默认值，界面里可以改、可以删）。
-- 模板变量：{{name}} {{handle}} {{platform}} {{channel_url}} {{product}} {{product_link}} {{my_name}} {{company}} {{quote}}

INSERT INTO templates (name, scene, language, subject, body, created_at, updated_at) VALUES
('开发信 · 标准版', 'outreach', 'en',
 'Collab idea for {{name}}: {{product}} review',
 'Hi {{name}},

I''m {{my_name}} from {{company}}. I''ve been watching your {{platform}} content for a while, and the way you break down setups for your audience is exactly why I''m reaching out.

We make {{product}}, a standalone VR headset that works great for flight and racing sims, and we''re looking for a small number of European creators to put it through a real, honest review. No script, no talking points you have to read.

What we can offer:
- A review unit shipped to you (we cover shipping and customs)
- A personal affiliate link with a commission on every sale
- A paid collaboration on top, if the format fits

Would you be open to a quick chat? If you already have a media kit or rate card, feel free to send it over.

Best regards,
{{my_name}}
{{company}}', datetime('now'), datetime('now')),

('Erstkontakt · Standard', 'outreach', 'de',
 'Kooperationsidee für {{name}}: {{product}} im Test',
 'Hallo {{name}},

ich bin {{my_name}} von {{company}}. Ich verfolge deine Videos auf {{platform}} schon eine Weile, und gerade deine ausführlichen Setup-Erklärungen sind der Grund, warum ich mich melde.

Wir entwickeln {{product}}, ein VR-Headset, das sich besonders gut für Flug- und Rennsimulationen eignet. Für einen ehrlichen Praxistest suchen wir eine kleine Auswahl an Creatorn aus Europa – ohne Skript und ohne Vorgaben.

Was wir anbieten:
- Ein Testgerät, Versand und Zoll übernehmen wir
- Einen persönlichen Affiliate-Link mit Provision auf jeden Verkauf
- Auf Wunsch zusätzlich eine bezahlte Kooperation

Hättest du Lust auf ein kurzes Gespräch? Wenn du ein Media Kit oder eine Preisliste hast, schick sie gern mit.

Viele Grüße
{{my_name}}
{{company}}', datetime('now'), datetime('now')),

('首次跟进', 'follow1', 'en',
 'Re: Collab idea for {{name}}: {{product}} review',
 'Hi {{name}},

Just bringing my earlier message back to the top of your inbox in case it got buried. We''d love to send you a {{product}} unit for an honest review, together with a personal affiliate link.

Happy to answer any questions, or to adapt the idea to whatever format works best for your channel.

Best,
{{my_name}}', datetime('now'), datetime('now')),

('二次跟进 · 最后一封', 'follow2', 'en',
 'Last note from me – {{product}}',
 'Hi {{name}},

I don''t want to crowd your inbox, so this will be my last follow-up. If a {{product}} review isn''t a fit right now, no problem at all.

If timing is the issue, just reply with a month that works better and I''ll check back then.

Thanks for your time, and keep up the great work on {{channel_url}}.

{{my_name}}
{{company}}', datetime('now'), datetime('now')),

('寄样确认', 'sample', 'en',
 'Your {{product}} is on its way',
 'Hi {{name}},

Great news: your {{product}} review unit has been shipped. I''ll send the tracking number as soon as the carrier activates it.

A few quick notes:
- Your personal affiliate link: {{product_link}}
- Please let me know once it arrives, and if anything is missing or damaged
- There''s no fixed script. We just ask that the video is clearly marked as an ad / sponsored according to your country''s rules

Looking forward to seeing what you think!

{{my_name}}', datetime('now'), datetime('now')),

('发布提醒', 'publish', 'en',
 'Quick check-in on the {{product}} video',
 'Hi {{name}},

Hope you''re enjoying the {{product}}! I wanted to check in on the timing for your review. Do you have a rough publish date in mind?

When it goes live, please remember to add your affiliate link in the description and pinned comment:
{{product_link}}

If you need anything from us (b-roll, specs, a second controller for testing), just let me know.

Best,
{{my_name}}', datetime('now'), datetime('now')),

('成交结算', 'settle', 'en',
 'Your {{product}} commission summary',
 'Hi {{name}},

Thanks again for the review. It performed really well! Here is your commission summary for this period:

- Agreed rate / fee: {{quote}}
- Sales and commission details: see the attached statement

Please reply with an invoice (or your payment details if you invoice as an individual) and we''ll process the payment within the usual timeframe.

Thanks for being a great partner,
{{my_name}}
{{company}}', datetime('now'), datetime('now')),

('婉拒', 'decline', 'en',
 'Re: Collaboration with {{company}}',
 'Hi {{name}},

Thank you so much for getting back to us and for sharing your rates. After reviewing our budget for this campaign, we''re not able to move forward at the moment.

We really like your content, though, and I''d love to keep in touch for future launches.

All the best,
{{my_name}}', datetime('now'), datetime('now'));

INSERT INTO keywords (category, language, keyword, created_at) VALUES
('飞行模拟', 'en', 'flight sim VR', datetime('now')),
('飞行模拟', 'en', 'MSFS VR headset', datetime('now')),
('飞行模拟', 'en', 'DCS World VR', datetime('now')),
('飞行模拟', 'de', 'VR Flugsimulator', datetime('now')),
('飞行模拟', 'de', 'Flugsimulator VR Brille', datetime('now')),
('飞行模拟', 'fr', 'simulateur de vol VR', datetime('now')),
('飞行模拟', 'es', 'simulador de vuelo VR', datetime('now')),
('飞行模拟', 'it', 'simulatore di volo VR', datetime('now')),
('飞行模拟', 'nl', 'vluchtsimulator VR', datetime('now')),
('飞行模拟', 'pl', 'symulator lotu VR', datetime('now')),
('赛车模拟', 'en', 'sim racing VR', datetime('now')),
('赛车模拟', 'en', 'iRacing VR', datetime('now')),
('赛车模拟', 'en', 'Assetto Corsa VR', datetime('now')),
('赛车模拟', 'de', 'Sim Racing VR Brille', datetime('now')),
('赛车模拟', 'fr', 'simulation automobile VR', datetime('now')),
('赛车模拟', 'es', 'simracing VR', datetime('now')),
('赛车模拟', 'it', 'simulatore di guida VR', datetime('now')),
('赛车模拟', 'pl', 'symulator wyścigowy VR', datetime('now')),
('模拟器', 'en', 'simulator cockpit setup', datetime('now')),
('模拟器', 'en', 'Euro Truck Simulator VR', datetime('now')),
('模拟器', 'de', 'Simulator Setup VR', datetime('now')),
('VR 游戏', 'en', 'VR gaming', datetime('now')),
('VR 游戏', 'en', 'best VR games', datetime('now')),
('VR 游戏', 'de', 'VR Spiele', datetime('now')),
('VR 游戏', 'fr', 'jeux VR', datetime('now')),
('VR 游戏', 'es', 'juegos VR', datetime('now')),
('VR 游戏', 'it', 'giochi VR', datetime('now')),
('数码测评', 'en', 'VR headset review', datetime('now')),
('数码测评', 'en', 'tech unboxing', datetime('now')),
('数码测评', 'de', 'VR Brille Test', datetime('now')),
('数码测评', 'fr', 'test casque VR', datetime('now')),
('数码测评', 'es', 'review gafas VR', datetime('now')),
('数码测评', 'it', 'recensione visore VR', datetime('now')),
('数码测评', 'nl', 'VR bril review', datetime('now')),
('数码测评', 'pl', 'recenzja gogli VR', datetime('now'));
