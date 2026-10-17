import Image from "next/image";

export function TicketinoMark() {
  return (
    <Image
      src="/icon.svg"
      width={64}
      height={64}
      alt=""
      aria-hidden="true"
      className="ticketino-mark"
      loading="eager"
    />
  );
}
