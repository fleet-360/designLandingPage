Copied as is to the root of dist/ by tools/build.py (`copy_static`): files that other systems link to by
a fixed address and that must not move.

| File | Linked from |
| --- | --- |
| `.well-known/apple-developer-merchantid-domain-association` | Apple, verifying www.pro-algo.com for Apple Pay in Grow's payment window. Grow's production file, byte for byte, from developers.grow.business/reference/sdk-apple |
| `images/logo/Vertical-logo-white.png` | Toro's Pro Algorithm receipt email (cars-server `services/mail/mails/paymentRecivedAiAdvisor.mail.js`) |
