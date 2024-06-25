// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  Clock,
  FSComponent,
  HEventPublisher,
  InstrumentBackplane,
  StallWarningPublisher,
  Subject,
} from '@microsoft/msfs-sdk';
import { ArincEventBus } from '@flybywiresim/fbw-sdk';
import { FwcPublisher, RopRowOansPublisher } from '@flybywiresim/msfs-avionics-common';

import { FmsDataPublisher } from '../MsfsAvionicsCommon/providers/FmsDataPublisher';
import { DmcPublisher } from '../MsfsAvionicsCommon/providers/DmcPublisher';
import { getDisplayIndex, PFDComponent } from './PFD';
import { AdirsValueProvider } from '../MsfsAvionicsCommon/AdirsValueProvider';
import { ArincValueProvider } from './shared/ArincValueProvider';
import { PFDSimvarPublisher, PFDSimvars } from './shared/PFDSimvarPublisher';
import { SimplaneValueProvider } from './shared/SimplaneValueProvider';

import './style.scss';

// TODO move this whole thing to InstrumentBackplane and GameStateProvider

class A32NX_PFD extends BaseInstrument {
  private readonly bus = new ArincEventBus();

  private readonly backplane = new InstrumentBackplane();

  private readonly simVarPublisher = new PFDSimvarPublisher(this.bus);

  private readonly hEventPublisher = new HEventPublisher(this.bus);

  private readonly arincProvider = new ArincValueProvider(this.bus);

  private readonly simplaneValueProvider = new SimplaneValueProvider(this.bus);

  private readonly clock = new Clock(this.bus);

  // FIXME fit this into the normal backplane pattern
  private adirsValueProvider: AdirsValueProvider<PFDSimvars>;

  private readonly dmcPublisher = new DmcPublisher(this.bus);

  // FIXME fit this into the normal backplane pattern
  private fmsDataPublisher: FmsDataPublisher;

  private readonly ropRowOansPublisher = new RopRowOansPublisher(this.bus);

  private readonly stallWarningPublisher = new StallWarningPublisher(this.bus, 1);

  private readonly fwcPublisher = new FwcPublisher(this.bus);

  /**
   * "mainmenu" = 0
   * "loading" = 1
   * "briefing" = 2
   * "ingame" = 3
   */
  private gameState = 0;

  constructor() {
    super();

    this.backplane.addPublisher('PfdSimvars', this.simVarPublisher);
    this.backplane.addPublisher('hEvent', this.hEventPublisher);
    this.backplane.addInstrument('arincProvider', this.arincProvider);
    this.backplane.addInstrument('simPlane', this.simplaneValueProvider);
    this.backplane.addInstrument('Clock', this.clock);
    this.backplane.addPublisher('Dmc', this.dmcPublisher);
    this.backplane.addPublisher('RopRowOans', this.ropRowOansPublisher);
    this.backplane.addPublisher('stallWarning', this.stallWarningPublisher);
    this.backplane.addPublisher('Fwc', this.fwcPublisher);
  }

  get templateID(): string {
    return 'A32NX_PFD';
  }

  public getDeltaTime() {
    return this.deltaTime;
  }

  public onInteractionEvent(args: string[]): void {
    this.hEventPublisher.dispatchHEvent(args[0]);
  }

  public connectedCallback(): void {
    super.connectedCallback();

    this.adirsValueProvider = new AdirsValueProvider(
      this.bus,
      this.simVarPublisher,
      getDisplayIndex() === 1 ? 'L' : 'R',
    );

    const stateSubject = Subject.create<'L' | 'R'>(getDisplayIndex() === 1 ? 'L' : 'R');
    this.fmsDataPublisher = new FmsDataPublisher(this.bus, stateSubject);

    this.backplane.init();

    FSComponent.render(<PFDComponent bus={this.bus} instrument={this} />, document.getElementById('PFD_CONTENT'));

    // Remove "instrument didn't load" text
    document.getElementById('PFD_CONTENT').querySelector(':scope > h1').remove();
  }

  /**
   * A callback called when the instrument gets a frame update.
   */
  public Update(): void {
    super.Update();

    this.backplane.onUpdate();

    if (this.gameState !== 3) {
      const gamestate = this.getGameState();
      if (gamestate === 3) {
        this.adirsValueProvider.start();
        this.fmsDataPublisher.startPublish();
      }
      this.gameState = gamestate;
    } else {
      this.fmsDataPublisher.onUpdate();
    }
  }
}

registerInstrument('a32nx-pfd', A32NX_PFD);
