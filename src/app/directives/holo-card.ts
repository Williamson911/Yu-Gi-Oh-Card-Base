import { Directive, ElementRef, HostListener, inject } from '@angular/core';

const MAX_TILT_DEG = 10;

@Directive({
  selector: '[appHoloCard]',
})
export class HoloCard {
  private readonly host: HTMLElement =
    inject(ElementRef<HTMLElement>).nativeElement;

  @HostListener('mouseenter')
  protected onEnter() {
    this.host.style.setProperty('--holo-active', '1');
  }

  @HostListener('mouseleave')
  protected onLeave() {
    this.host.style.setProperty('--holo-active', '0');
    this.host.style.setProperty('--rx', '0deg');
    this.host.style.setProperty('--ry', '0deg');
  }

  @HostListener('mousemove', ['$event'])
  protected onMove(event: MouseEvent) {
    const rect = this.host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const rx = (0.5 - y) * MAX_TILT_DEG;
    const ry = (x - 0.5) * MAX_TILT_DEG;
    this.host.style.setProperty('--mx', `${x * 100}%`);
    this.host.style.setProperty('--my', `${y * 100}%`);
    this.host.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    this.host.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
  }
}
