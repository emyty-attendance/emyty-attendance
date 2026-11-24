FROM ruby:3.2-slim

WORKDIR /app

RUN apt-get update -qq && apt-get install -y build-essential libsqlite3-dev

COPY Gemfile* ./
RUN bundle install

COPY . .

EXPOSE 8080 10000

ENV PORT=8080

CMD ["ruby", "server.rb"]
