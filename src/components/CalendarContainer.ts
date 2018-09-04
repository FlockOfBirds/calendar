import { Component, ReactChild, createElement } from "react";

import { Calendar, CalendarEvent } from "./Calendar";
import { fetchByMicroflow, fetchByNanoflow, fetchData } from "../utils/data";
import { Container, Data } from "../utils/namespaces";
import * as moment from "moment";
export interface CalendarContainerState {
    alertMessage: ReactChild;
    events: CalendarEvent[];
    eventCache: mendix.lib.MxObject[];
    eventColor: string;
    loading: boolean;
    startPosition: Date;
}

export default class CalendarContainer extends Component<Container.CalendarContainerProps, CalendarContainerState> {
    private subscriptionHandles: number[] = [];

    readonly state: CalendarContainerState = {
        alertMessage: "",
        events: [],
        eventCache: [],
        eventColor: "",
        loading: true,
        startPosition: new Date()
    };

    componentWillMount() {
        moment.updateLocale(window.mx.session.sessionData.locale.code, {
            week: { dow: window.mx.session.sessionData.locale.firstDayOfWeek, doy: 6 }
        });
    }

    render() {
        const readOnly = this.isReadOnly();
        const alertMessage = this.state.alertMessage || CalendarContainer.validateProps(this.props);

        return createElement("div",
            {
                style: this.state.loading ? { ...parseStyle(this.props.style) } : undefined
            },
            createElement(Calendar, {
                alertMessage,
                className: this.props.class,
                editable: this.props.editable,
                enableCreate: this.props.enableCreate,
                formats: this.setCalendarFormats(),
                height: this.props.height,
                heightUnit: this.props.heightUnit,
                messages: this.setCustomViews(),
                events: this.state.events,
                defaultView: this.props.defaultView,
                popup: this.props.popup,
                startPosition: this.state.startPosition,
                loading: this.state.loading,
                style: parseStyle(this.props.style),
                viewOption: this.props.view,
                width: this.props.width,
                widthUnit: this.props.widthUnit,
                onSelectEventAction: !readOnly ? this.handleOnClickEvent : undefined,
                onEventResizeAction: !readOnly ? this.handleOnChangeEvent : undefined,
                onSelectSlotAction: !readOnly ? this.onClickSlot : undefined,
                onEventDropAction: !readOnly ? this.handleOnChangeEvent : undefined,
                onViewChangeAction: this.onChangeView,
                customViews: this.props.customViews
            })
        );
    }

    componentWillUnMount() {
        this.subscriptionHandles.forEach(window.mx.data.unsubscribe);
    }

    componentWillReceiveProps(nextProps: Container.CalendarContainerProps) {
        if (nextProps.mxObject) {
            if (!this.state.alertMessage) {
                this.loadEvents(nextProps.mxObject);
                this.getStartPosition(nextProps.mxObject);
            }
            this.resetSubscriptions(nextProps.mxObject);
        } else {
            this.setState({ events: [], loading: false });
        }

    }

    private setCalendarEvents = (mxObjects: mendix.lib.MxObject[]) => {
        const events = mxObjects.map(mxObject => {
            return {
                title: mxObject.get(this.props.titleAttribute) as string || " ",
                allDay: mxObject.get(this.props.allDayAttribute) as boolean,
                start: new Date(mxObject.get(this.props.startAttribute) as number),
                end: new Date(mxObject.get(this.props.endAttribute) as number),
                color: mxObject.get(this.props.eventColor) as string,
                guid: mxObject.getGuid()
            };
        });
        this.setState({ events, eventCache: mxObjects });
    }

    private getStartPosition = (mxObject: mendix.lib.MxObject) => {
        if (mxObject) {
            this.setState({
                loading: false,
                startPosition: this.props.startDateAttribute
                    ? new Date(mxObject.get(this.props.startDateAttribute) as number) :
                    new Date()
            });
        }
    }

    private isReadOnly(): boolean {
        return !this.props.mxObject || !this.props.editable || this.props.readOnly;
    }

    private loadEvents = (mxObject: mendix.lib.MxObject) => {
        const { dataSource } = this.props;
        if (!mxObject) return;
        const guid = mxObject ? mxObject.getGuid() : "";
        if (dataSource === "context" && mxObject) {
            this.setCalendarEvents([ mxObject ]);
        } else {
            fetchData({
                guid,
                type: dataSource,
                entity: this.props.eventEntity,
                constraint: this.props.entityConstraint,
                microflow: this.props.dataSourceMicroflow,
                mxform: this.props.mxform,
                nanoflow: this.props.dataSourceNanoflow
            }).then(this.setCalendarEvents);
        }
    }

    private resetSubscriptions = (mxObject: mendix.lib.MxObject) => {
        this.subscriptionHandles.forEach(window.mx.data.unsubscribe);
        this.subscriptionHandles = [];

        if (mxObject) {
            this.subscriptionHandles.push(window.mx.data.subscribe({
                entity: this.props.eventEntity,
                callback: () => this.loadEvents(mxObject)
            }));
            this.subscriptionHandles.push(window.mx.data.subscribe({
                guid: mxObject.getGuid(),
                callback: () => this.loadEvents(mxObject)
            }));
            [
                this.props.titleAttribute,
                this.props.startAttribute,
                this.props.endAttribute,
                this.props.eventColor
            ].forEach(attr => this.subscriptionHandles.push(window.mx.data.subscribe({
                attr,
                callback: () => this.loadEvents(mxObject),
                guid: mxObject.getGuid()
            })));
            this.subscriptionHandles.push(window.mx.data.subscribe({
                guid: mxObject.getGuid(),
                attr: this.props.startDateAttribute,
                callback: () => this.getStartPosition(mxObject)
            }));
        }
    }

    private setCustomViews = () => {
        const viewOptions: Container.ViewOptions = {};
        this.props.customViews.forEach(customView => {
            (viewOptions as any)[customView.customView] = customView.customCaption;
            if (customView.customView === "agenda") {
                viewOptions.allDay = customView.allDayText;
                viewOptions.date = customView.textHeaderDate;
                viewOptions.time = customView.textHeaderTime;
                viewOptions.event = customView.textHeaderEvent;
            }
        });

        return viewOptions;
    }

    private setCalendarFormats = () => {
        const viewOptions: Container.ViewOptions = {};
        this.props.customViews.forEach((customView) => {
            viewOptions.dateFormat = customView.customView === "month"
                ? this.customFormat(customView.cellDateFormat, "date")
                : viewOptions.dateFormat;
            viewOptions.dayFormat = customView.customView === "day"
                || customView.customView === "week"
                || customView.customView === "work_week"
                ? this.customFormat(customView.gutterDateFormat, "day")
                : viewOptions.dayFormat;
            viewOptions.weekdayFormat = customView.customView === "month"
                ? this.customFormat(customView.headerFormat, "weekday")
                : viewOptions.weekdayFormat;
            viewOptions.timeGutterFormat = customView.customView === "week"
                || customView.customView === "day"
                || customView.customView === "work_week"
                ? this.customFormat(customView.gutterTimeFormat, "timeGutter")
                : viewOptions.timeGutterFormat;
        });

        return viewOptions;
    }

    private customFormat = (dateFormat: string, dateType: Container.DateType) => {
        let datePattern = "";
        if (dateType === "date") {
            datePattern = dateFormat || "dd";
        } else if (dateType === "day") {
            datePattern = dateFormat || "EEE dd/MM";
        } else if (dateType === "weekday") {
            datePattern = dateFormat || "EEEE";
        } else if (dateType === "timeGutter") {
            datePattern = dateFormat || "hh:mm a";
        }

        return (date: Date) => window.mx.parser.formatValue(date, "datetime", { datePattern });
    }

    private onChangeView = () => {
        if (this.props.executeOnViewChange && this.props.mxObject) {
            const guid = this.props.mxObject ? this.props.mxObject.getGuid() : "";
            if (this.props.dataSource === "microflow") {
                fetchByMicroflow(this.props.dataSourceMicroflow, guid);
            }
            if (this.props.dataSource === "nanoflow") {
                fetchByNanoflow(this.props.dataSourceNanoflow, this.props.mxform);
            }
        }
    }

    private handleOnClickEvent = (eventInfo: Container.EventInfo) => {
        mx.data.get({
            guid: eventInfo.guid,
            callback: this.executeEventAction,
            error: error => window.mx.ui.error(`Error while executing action: ${error.message}`)
        });
    }

    private executeEventAction = (mxObject: mendix.lib.MxObject) => {
        const { onClickEvent, onClickMicroflow, mxform, onClickNanoflow } = this.props;
        if (!mxObject || !mxObject.getGuid()) {
            return;
        }
        this.executeAction(mxObject, onClickEvent, onClickMicroflow, mxform, onClickNanoflow);
    }

    private onClickSlot = (slotInfo: Container.EventInfo) => {
        mx.data.create({
            entity: this.props.eventEntity,
            callback: (object) => {
                object.set(this.props.titleAttribute, object.get(this.props.titleAttribute));
                object.set(this.props.eventColor, object.get(this.props.titleAttribute));
                object.set(this.props.startAttribute, slotInfo.start);
                object.set(this.props.endAttribute, slotInfo.end);
                this.executeSlotAction(object);
            },
            error: error => window.mx.ui.error(`Error while creating a new event: ${ error.message }`)
        });
    }

    private executeSlotAction(mxObject: mendix.lib.MxObject) {
        const { onCreate, onCreateMicroflow, mxform, onCreateNanoflow } = this.props;
        this.executeAction(mxObject, onCreate, onCreateMicroflow, mxform, onCreateNanoflow);
    }

    private handleOnChangeEvent = (eventInfo: Container.EventInfo) => {
        const { events } = this.state;
        const eventPosition = events.indexOf(eventInfo.event);
        const updatedEvent: CalendarEvent = {
            title: eventInfo.event.title,
            allDay: eventInfo.event.allDay,
            start: eventInfo.start,
            end: eventInfo.end,
            guid: eventInfo.event.guid,
            color: eventInfo.event.color
        };
        const nextEvents = [ ...events ];
        nextEvents.splice(eventPosition, 1, updatedEvent);
        this.setState({ events: nextEvents });
        const mxEventObject = this.state.eventCache.filter(object => object.getGuid() === eventInfo.event.guid)[0];
        if (mxEventObject) {
            mxEventObject.set(this.props.titleAttribute, eventInfo.event.title);
            mxEventObject.set(this.props.eventColor, eventInfo.event.color);
            mxEventObject.set(this.props.startAttribute, eventInfo.start);
            mxEventObject.set(this.props.endAttribute, eventInfo.end);
            this.executeOnDropAction(mxEventObject);
        }
    }

    private executeOnDropAction = (mxObject: mendix.lib.MxObject) => {
        if (!mxObject || !mxObject.getGuid()) { return; }
        const { onChangeEvent, onChangeMicroflow, mxform, onChangeNanoflow } = this.props;
        this.executeAction(mxObject, onChangeEvent, onChangeMicroflow, mxform, onChangeNanoflow);
    }

    private executeAction(mxObject: mendix.lib.MxObject, action: Container.OnClickEventOptions, microflow: string, mxform: mxui.lib.form._FormBase, nanoflow: Data.Nanoflow) {
        const context = new mendix.lib.MxContext();
        context.setContext(mxObject.getEntity(), mxObject.getGuid());
        if (action === "callMicroflow" && microflow && mxObject.getGuid()) {
            window.mx.ui.action(microflow, {
                context,
                origin: mxform,
                error: error => window.mx.ui.error(
                    `Error while executing microflow: ${microflow}: ${error.message}`
                )
            });
        } else if (action === "callNanoflow" && nanoflow.nanoflow) {
            window.mx.data.callNanoflow({
                nanoflow,
                origin: mxform,
                context,
                error: error => window.mx.ui.error(
                    `An error occurred while executing the nanoflow: ${error.message}`
                )
            });
        }
    }

    public static validateProps(props: Container.CalendarContainerProps): ReactChild {
        const errorMessages: string[] = [];

        if (props.onClickEvent === "callMicroflow" && !props.onClickMicroflow) {
            errorMessages.push("On click event is set to 'Call a microflow' but no microflow is selected");
        } else if (props.onClickEvent === "callNanoflow" && !props.onClickNanoflow.nanoflow) {
            errorMessages.push("On click event is set to 'Call a nanoflow' but no nanoflow is selected");
        }
        if (props.onCreate === "callMicroflow" && !props.onCreateMicroflow) {
            errorMessages.push("On create event is set to 'Call a microflow' but no microflow is selected");
        } else if (props.onCreate === "callNanoflow" && !props.onCreateNanoflow.nanoflow) {
            errorMessages.push("On create event is set to 'Call a nanoflow' but no nanoflow is selected");
        }
        if (props.onChangeEvent === "callMicroflow" && !props.onChangeMicroflow) {
            errorMessages.push("On change event is set to 'Call a microflow' but no microflow is selected");
        } else if (props.onChangeEvent === "callNanoflow" && !props.onChangeNanoflow.nanoflow) {
            errorMessages.push("On change event is set to 'Call a nanoflow' but no nanoflow is selected");
        }
        if (props.dataSource === "microflow" && !props.dataSourceMicroflow) {
            errorMessages.push("Datasource is set to 'microflow' but no microflow is selected");
        } else if (props.dataSource === "nanoflow" && !props.dataSourceNanoflow.nanoflow) {
            errorMessages.push("Datasource is set to 'nanoflow' but no nanoflow is selected");
        }
        if (props.dataSource === "context" && (props.mxObject && props.mxObject.getEntity() !== props.eventEntity)) {
            errorMessages.push(`${props.friendlyId}: Context entity does not match the event entity`);
        }
        if (props.view === "custom" && props.customViews.length <= 0) {
            errorMessages.push(`${props.friendlyId}: View is set to "custom" but there is no view selected`);
        }
        try {
            if (props.view === "custom") {
                const viewOptions: Container.ViewOptions = {};
                props.customViews.forEach(customView => {
                    viewOptions.dateFormat = window.mx.parser.formatValue(
                        new Date(),
                        "datetime",
                        { datePattern: customView.cellDateFormat }
                    );
                    viewOptions.dayFormat = window.mx.parser.formatValue(
                        new Date(),
                        "datetime",
                        { datePattern: customView.gutterDateFormat }
                    );
                    viewOptions.weekdayFormat = window.mx.parser.formatValue(
                        new Date(),
                        "datetime",
                        { datePattern: customView.headerFormat }
                    );
                    viewOptions.timeGutterFormat = window.mx.parser.formatValue(
                        new Date(),
                        "datetime",
                        { datePattern: customView.gutterTimeFormat }
                    );
                });
            }
        } catch (error) {
            errorMessages.push(`${props.friendlyId}: Invalid format value`);
        }
        if (errorMessages.length) {
            return createElement("div", {},
                "Error in calendar configuration:",
                errorMessages.map((message, key) => createElement("p", { key }, message))
            );
        }

        return "";
    }

    public static logError(message: string, style?: string, error?: any) {
        // tslint:disable-next-line:no-console
        window.logger ? window.logger.error(message) : console.log(message, style, error);
    }
}

export const parseStyle = (style = ""): { [key: string]: string } => {
    try {
        return style.split(";").reduce<{ [key: string]: string }>((styleObject, line) => {
            const pair = line.split(":");
            if (pair.length === 2) {
                const name = pair[0].trim().replace(/(-.)/g, match => match[1].toUpperCase());
                styleObject[name] = pair[1].trim();
            }

            return styleObject;
        }, {});
    } catch (error) {
        CalendarContainer.logError("Failed to parse style", style, error);
    }

    return {};
};
