export const POOL_RULES_VERSION = '2026-08-27'

export const POOL_ACKNOWLEDGEMENT = 'I have read and agree to the Penny Lane Estates pool rules and access-card guidelines. I accept responsibility for my household and guests, understand that violations may result in suspended pool privileges, and accept the $20 fee for a lost or replacement access card.'

const rules = [
  'There is no lifeguard on duty. Swim at your own risk. The HOA is not responsible for accidents or lost or stolen items.',
  'Pool privileges require the property to remain current on HOA dues and assessments.',
  'Do not share pool access with a non-resident unless an eligible resident is present.',
  'Report a lost or stolen access card promptly. The first card is free; additional or replacement cards cost $20.',
  'Wear appropriate swimwear. Cutoffs are not permitted.',
  'Cloth and disposable diapers are not permitted in the pool. Change diapers outside the pool fence or on the restroom changing tables.',
  'Children under 14 must be accompanied by an adult age 17 or older.',
  'Keep the restrooms clean and locked.',
  'No diving, running, dunking, horseplay, pushing, profanity, or lewd behavior.',
  'Skateboards, skates, scooters, rollerblades, and bicycles are not permitted inside the fenced pool area.',
  'Tobacco products and glass containers are not permitted inside the fenced pool area.',
  'Pets are not permitted, except service animals.',
  'Guests must be accompanied by a resident age 17 or older. The resident is responsible for guest conduct.',
  'Do not enter the pool for two weeks after a diarrheal illness.',
  'Place trash in the provided containers and remove all toys and personal items when leaving.',
  'The pool is closed every Monday and Thursday from 7:00 a.m. to 10:00 a.m. for cleaning and maintenance. Entry is not permitted during the closure.',
]

export function PoolRules({ compact = false }) {
  return <div className={`pool-rules ${compact ? 'pool-rules-compact' : ''}`}>
    <div className="pool-facts"><div><small>Hours</small><strong>7:00 a.m. - 9:00 p.m.</strong><span>Monday and Thursday open at 10:00 a.m.</span></div><div><small>Maintenance closure</small><strong>Mon. &amp; Thu.</strong><span>Closed 7:00-10:00 a.m.; no entry</span></div><div><small>Replacement card</small><strong>$20</strong><span>Also applies to additional cards</span></div><div><small>Safety</small><strong>No lifeguard</strong><span>Swim at your own risk</span></div></div>
    <h3>Pool rules</h3><ol>{rules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
    <h3>Access-card guidelines</h3><ul><li>Keep your access card available while inside the pool area.</li><li>Do not admit people who do not have a card.</li><li>Access may be suspended or revoked for rule violations.</li><li>Make sure the pool and restrooms are clean and locked when you leave.</li></ul>
  </div>
}
