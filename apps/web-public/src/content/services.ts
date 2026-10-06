import { SITE } from '../site';

/*
 * One entry per service page. Adding a service = adding an entry here: the route, the sitemap,
 * the services index, internal links and the JSON-LD all read from this list.
 *
 * Content rules: the problems listed are the issue types customers can actually book for that
 * appliance (the service catalogue); everything else describes how the service really works.
 * No prices here — the visiting charge comes from the live catalogue when booking.
 */

export interface ServiceProblem {
  title: string;
  text: string;
}

export interface Faq {
  question: string;
  answer: string;
}

export interface ServiceContent {
  /** URL slug: /ac-repair */
  slug: string;
  /** `service_categories.code` — picks the illustration and pre-selects the booking step. */
  code: string;
  /** "AC" — used in running text. */
  appliance: string;
  /** "AC repair & service" — card titles and anchor text. */
  title: string;
  /** "AC Repair & Service" — the H1 is `${heading} in ${city}`. */
  heading: string;
  /** Short line for cards. */
  summary: string;
  /** First paragraph on the page. */
  intro: string;
  /** What a visit covers. */
  covers: string[];
  problems: ServiceProblem[];
  faqs: Faq[];
  /** Slugs of related services, for internal links. */
  related: string[];
}

export const SERVICES: ServiceContent[] = [
  {
    slug: 'ac-repair',
    code: 'AC',
    appliance: 'AC',
    title: 'AC repair & service',
    heading: 'AC Repair & Service',
    summary: 'Cooling problems, leaks, gas refill, servicing and installation.',
    intro:
      'AC not cooling, leaking or making noise? Book a technician to come home, find the fault and explain the cost before any repair starts.',
    covers: [
      'Diagnosis of cooling, power and noise problems',
      'Gas refill when the system is low on refrigerant',
      'General service and cleaning',
      'Installation and uninstallation',
    ],
    problems: [
      { title: 'Not cooling', text: 'The AC runs but the room stays warm — often a gas, filter or compressor issue.' },
      { title: 'Water leaking', text: 'Water dripping from the indoor unit, usually a blocked or misaligned drain.' },
      { title: 'Strange noise', text: 'Rattling, buzzing or grinding from the indoor or outdoor unit.' },
      { title: 'Gas refill', text: 'Low refrigerant after a leak or long use, checked and refilled.' },
      { title: 'Not turning on', text: 'No power or the unit shuts off soon after starting.' },
      { title: 'Installation / uninstallation', text: 'Fitting a new AC or removing one before a move.' },
      { title: 'General service', text: 'Routine cleaning and check-up, ideally before summer.' },
    ],
    faqs: [
      {
        question: 'Do I need a gas refill if my AC is not cooling?',
        answer:
          'Not always. Weak cooling can also come from dirty filters, a faulty fan or a sensor. The technician checks first and tells you what is needed before doing any work.',
      },
      {
        question: 'Can you install or uninstall my AC?',
        answer: 'Yes. Choose "Installation / uninstallation" when you book so we send a technician with the right tools.',
      },
    ],
    related: ['refrigerator-repair', 'washing-machine-repair', 'tv-repair'],
  },
  {
    slug: 'refrigerator-repair',
    code: 'FRIDGE',
    appliance: 'refrigerator',
    title: 'Refrigerator repair',
    heading: 'Refrigerator Repair',
    summary: 'Not cooling, ice build-up, noise, gas refill and power faults.',
    intro:
      'Fridge not cooling or freezing over? Book a technician to diagnose it at home. You hear what is wrong and what it will cost before the repair begins.',
    covers: ['Diagnosis of cooling and defrost problems', 'Gas refill when the system is low on refrigerant', 'Power and starting faults', 'Noise from the compressor or fan'],
    problems: [
      { title: 'Not cooling', text: 'Food spoiling or the fridge feels warm even on the coldest setting.' },
      { title: 'Ice build-up', text: 'Thick frost in the freezer or on the back wall — often a defrost fault.' },
      { title: 'Strange noise', text: 'Loud humming, clicking or rattling from the compressor or fan.' },
      { title: 'Gas refill', text: 'Low refrigerant after a leak, checked and refilled.' },
      { title: 'Not turning on', text: 'No light, no sound, or the fridge keeps switching off.' },
    ],
    faqs: [
      {
        question: 'Should I empty the fridge before the technician arrives?',
        answer: 'It helps to move perishable food to a cool place. The technician will tell you if the fridge needs to be switched off for longer.',
      },
    ],
    related: ['ac-repair', 'washing-machine-repair', 'microwave-repair'],
  },
  {
    slug: 'washing-machine-repair',
    code: 'WASHER',
    appliance: 'washing machine',
    title: 'Washing machine repair',
    heading: 'Washing Machine Repair',
    summary: 'Not spinning, not draining, leaks, error codes and noise.',
    intro:
      'Washing machine stuck, leaking or showing an error code? Book a technician to inspect it at home and explain the repair and its cost before starting.',
    covers: ['Drum, motor and spin problems', 'Drainage and leaks', 'Error codes and control faults'],
    problems: [
      { title: 'Not spinning', text: 'Clothes come out soaking wet or the drum does not turn.' },
      { title: 'Not draining', text: 'Water stays in the drum after the cycle ends.' },
      { title: 'Water leaking', text: 'Water on the floor during or after a wash.' },
      { title: 'Showing an error code', text: 'The display shows a code and the machine stops.' },
      { title: 'Strange noise', text: 'Banging, grinding or loud vibration while washing or spinning.' },
    ],
    faqs: [
      {
        question: 'My machine shows an error code. What should I do?',
        answer: 'Note the code and mention it when you book. It helps the technician come prepared. Avoid running more cycles until it is checked.',
      },
    ],
    related: ['refrigerator-repair', 'ac-repair', 'microwave-repair'],
  },
  {
    slug: 'tv-repair',
    code: 'TV',
    appliance: 'TV',
    title: 'TV repair',
    heading: 'TV Repair',
    summary: 'No picture, no sound, lines on screen, power faults and wall mounting.',
    intro:
      'TV with no picture, no sound or lines across the screen? Book a technician to check it at home. You approve the cost before any repair is done.',
    covers: ['Display and picture faults', 'Sound and power faults', 'Wall mounting'],
    problems: [
      { title: 'No picture', text: 'Sound works but the screen stays dark or blank.' },
      { title: 'No sound', text: 'The picture works but there is no audio.' },
      { title: 'Lines on screen', text: 'Vertical or horizontal lines, or patches on the display.' },
      { title: 'Not turning on', text: 'No standby light, or the TV turns off by itself.' },
      { title: 'Wall mounting', text: 'Mounting your TV safely on the wall.' },
    ],
    faqs: [
      {
        question: 'Can every TV screen problem be repaired?',
        answer:
          'Not always. Some faults, such as a damaged screen panel, may cost more to repair than the TV is worth. The technician tells you honestly, and if it cannot be repaired only the visiting charge applies.',
      },
    ],
    related: ['microwave-repair', 'ac-repair', 'washing-machine-repair'],
  },
  {
    slug: 'microwave-repair',
    code: 'MICROWAVE',
    appliance: 'microwave',
    title: 'Microwave repair',
    heading: 'Microwave Repair',
    summary: 'Not heating, sparking inside and buttons not working.',
    intro:
      'Microwave running but not heating, or sparking inside? Stop using it and book a technician to check it at home and explain the fix before starting.',
    covers: ['Heating and power faults', 'Sparking and burning smells', 'Control panel and button problems'],
    problems: [
      { title: 'Not heating', text: 'The plate turns and the light is on, but food stays cold.' },
      { title: 'Sparking inside', text: 'Sparks or burning smell while running — stop using it until checked.' },
      { title: 'Buttons not working', text: 'Touch panel or buttons do not respond.' },
    ],
    faqs: [
      {
        question: 'Is it safe to use a microwave that sparks?',
        answer: 'No. Switch it off and unplug it until a technician has checked it.',
      },
    ],
    related: ['tv-repair', 'refrigerator-repair', 'washing-machine-repair'],
  },
];

export const serviceBySlug = (slug: string): ServiceContent | undefined => SERVICES.find((s) => s.slug === slug);

export const servicePath = (service: ServiceContent): string => `/${service.slug}`;

/** "AC Repair & Service in Hyderabad" — the H1 and the start of the page title. */
export const serviceHeading = (service: ServiceContent): string => `${service.heading} in ${SITE.city}`;

/** Questions that apply to every service, shown on the FAQ page and on each service page. */
export const GENERAL_FAQS: Faq[] = [
  {
    question: 'How do I book a repair?',
    answer: `Book online in a few steps: choose the appliance, describe the problem, enter your address and a preferred time, and confirm your mobile number with a one-time code. You can also call or message us on WhatsApp.`,
  },
  {
    question: 'How much does a visit cost?',
    answer:
      'Each appliance has a fixed visiting charge, shown before you confirm the booking. Any repair cost is explained to you by the technician before the work starts.',
  },
  {
    question: 'Which areas do you cover?',
    answer: `We serve homes in ${SITE.city}. When you book, enter your pincode and we tell you straight away whether we cover your area.`,
  },
  {
    question: 'When do I pay, and how?',
    answer: 'You pay after the visit, by UPI or cash. You receive a bill for the job.',
  },
  {
    question: 'What is the completion code?',
    answer:
      'When the technician arrives, we send you a short code on WhatsApp. The job is only marked complete when you share this code with the technician, so it is never closed without your say.',
  },
  {
    question: 'Can I see when the technician is coming?',
    answer: 'Yes. You get a tracking link on WhatsApp that shows who is assigned, when they are on the way, and your bill when the job is done.',
  },
  {
    question: 'What if my appliance cannot be repaired?',
    answer: 'The technician explains why. Only the visiting charge applies.',
  },
  {
    question: 'Can I change my visit time?',
    answer: 'Yes. Call or message us on WhatsApp with your request number and we will arrange a new time.',
  },
];

/** "Refrigerator repair" → "refrigerator repair" for mid-sentence use; acronyms ("AC", "TV") keep their case. */
export const inSentence = (text: string): string => (/^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));
