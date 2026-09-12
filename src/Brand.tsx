/** The selected artwork is kept intact; the viewport removes its transparent padding. */
export function Wordmark() {
  return (
    <span className="wordmark">
      <img
        src="/brand/wonderbook-round2/03-playful-wordmark.png"
        width="1998"
        height="787"
        alt="WonderBook"
      />
    </span>
  );
}

export function WelcomeIllustration() {
  return (
    <div className="wonder-scene">
      <span className="scene-spark scene-spark-one" aria-hidden="true">✳</span>
      <span className="scene-spark scene-spark-two" aria-hidden="true">✧</span>
      <div className="scene-frame">
        <img
          className="welcome-illustration"
          src="/brand/wonderbook-welcome-v1.png"
          alt="A little princess and a friendly green dragon sharing a glowing storybook in an enchanted forest."
          width="1122"
          height="1402"
          fetchPriority="high"
        />
        <div className="scene-caption">
          <span>ONCE UPON YOUR IMAGINATION</span>
          <p>A whole world.<br /><em>Waiting for your words.</em></p>
        </div>
      </div>
      <div className="imagination-note">
        <span className="note-star" aria-hidden="true">✦</span>
        <div><span>A LITTLE “WHAT IF…”</span><p>“Can the dragon be my friend?”</p></div>
      </div>
      <span className="scene-footnote">Your imagination is the main character.</span>
    </div>
  );
}
