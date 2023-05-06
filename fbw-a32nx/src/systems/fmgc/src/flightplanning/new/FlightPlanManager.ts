// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FlightPlan } from '@fmgc/flightplanning/new/plans/FlightPlan';
import { EventBus, Publisher } from '@microsoft/msfs-sdk';
import { FlightPlanSyncEvents, FlightPlanSyncResponsePacket } from '@fmgc/flightplanning/new/sync/FlightPlanSyncEvents';
import { SerializedFlightPlan } from '@fmgc/flightplanning/new/plans/BaseFlightPlan';

export enum FlightPlanIndex {
    Active,
    Temporary,
    Uplink,
    FirstSecondary,
}

export class FlightPlanManager {
    private plans: FlightPlan[] = []

    private ignoreSync = false;

    constructor(
        private readonly bus: EventBus,
        private readonly syncClientID: number,
        private readonly master: boolean,
    ) {
        const subs = bus.getSubscriber<FlightPlanSyncEvents>();

        subs.on('flightPlanManager.syncRequest').handle(() => {
            if (!this.ignoreSync) {
                console.log('[FpmSync] SyncRequest()');

                const plansRecord: Record<number, SerializedFlightPlan> = {};

                for (const plan of this.plans) {
                    if (plan) {
                        plansRecord[plan.index] = plan.serialize();
                    }
                }

                const response: FlightPlanSyncResponsePacket = { plans: plansRecord };

                this.sendEvent('flightPlanManager.syncResponse', response);
            }
        });

        subs.on('flightPlanManager.syncResponse').handle((event) => {
            console.log('[FpmSync] SyncResponse()');

            for (const [index, serialisedPlan] of Object.entries(event.plans)) {
                const intIndex = parseInt(index);

                const newPlan = FlightPlan.fromSerializedFlightPlan(intIndex, serialisedPlan, this.bus);

                this.set(intIndex, newPlan);
            }

            console.log(event);
        });

        subs.on('flightPlanManager.create').handle((event) => {
            if (!this.ignoreSync) {
                console.log(`[FpmSync] Create(${event.planIndex})`);
                this.create(event.planIndex, false);
            }
        });

        subs.on('flightPlanManager.delete').handle((event) => {
            if (!this.ignoreSync) {
                console.log(`[FpmSync] Delete(${event.planIndex})`);
                this.delete(event.planIndex, false);
            }
        });

        subs.on('flightPlanManager.deleteAll').handle(() => {
            if (!this.ignoreSync) {
                console.log('[FpmSync] DeleteAll');
                this.deleteAll(false);
            }
        });

        subs.on('flightPlanManager.copy').handle((event) => {
            if (!this.ignoreSync) {
                console.log(`[FpmSync] Copy(${event.planIndex}, ${event.targetPlanIndex})`);
                this.copy(event.planIndex, event.targetPlanIndex, false);
            }
        });

        subs.on('flightPlanManager.swap').handle((event) => {
            if (!this.ignoreSync) {
                console.log(`[FpmSync] Swap(${event.planIndex}, ${event.targetPlanIndex})`);
                this.swap(event.planIndex, event.targetPlanIndex, false);
            }
        });

        if (!master) {
            setTimeout(() => this.sendEvent('flightPlanManager.syncRequest', undefined), 5_000);
        }

        this.syncPub = this.bus.getPublisher<FlightPlanSyncEvents>();
    }

    private readonly syncPub: Publisher<FlightPlanSyncEvents>;

    has(index: number) {
        return this.plans[index] !== undefined;
    }

    get(index: number) {
        this.assertFlightPlanExists(index);

        return this.plans[index];
    }

    private set(index: number, flightPlan: FlightPlan) {
        this.plans[index] = flightPlan;
    }

    create(index: number, notify = true) {
        this.assertFlightPlanDoesntExist(index);

        this.plans[index] = FlightPlan.empty(index, this.bus);

        if (notify) {
            this.sendEvent('flightPlanManager.create', { planIndex: index });
        }
    }

    delete(index: number, notify = true) {
        this.assertFlightPlanExists(index);

        this.plans[index] = undefined;

        if (notify) {
            this.sendEvent('flightPlanManager.delete', { planIndex: index });
        }
    }

    deleteAll(notify = true) {
        this.plans.length = 0;

        if (notify) {
            this.sendEvent('flightPlanManager.deleteAll', undefined);
        }
    }

    copy(from: number, to: number, notify = true) {
        this.assertFlightPlanExists(from);

        const newPlan = this.get(from).clone(to);

        this.set(to, newPlan);
        this.get(to).incrementVersion();

        console.log(this.get(to).serialize());

        if (notify) {
            this.sendEvent('flightPlanManager.copy', { planIndex: from, targetPlanIndex: to });
        }
    }

    swap(a: number, b: number, notify = true) {
        this.assertFlightPlanExists(a);
        this.assertFlightPlanExists(b);

        const planA = this.get(a);
        const planB = this.get(b);

        this.delete(a, false);
        this.delete(b, false);

        this.set(a, planB);
        this.set(b, planA);

        if (notify) {
            this.sendEvent('flightPlanManager.swap', { planIndex: a, targetPlanIndex: b });
        }
    }

    private sendEvent<K extends keyof FlightPlanSyncEvents>(topic: K, data: FlightPlanSyncEvents[K]): void {
        this.ignoreSync = true;
        this.syncPub.pub(topic, data, true, false);
        this.ignoreSync = false;
    }

    private assertFlightPlanExists(index: number) {
        if (!this.plans[index]) {
            throw new Error(`[FMS/FlightPlanManager] Tried to access non-existent flight plan at index #${index}`);
        }
    }

    private assertFlightPlanDoesntExist(index: number) {
        if (this.plans[index]) {
            throw new Error(`[FMS/FlightPlanManager] Tried to create existent flight plan at index #${index}`);
        }
    }
}
